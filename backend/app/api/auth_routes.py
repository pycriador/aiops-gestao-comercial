"""Authentication API endpoints (/auth/v1)."""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app.auth.security import (
  create_access_token,
  decode_access_token,
  hash_password,
  hash_refresh_token,
  iso,
  new_refresh_token,
  verify_password,
)
from sqlalchemy import select

from app.extensions import db
from app.models import AuthUser, Consultant, RefreshToken, UserRole, utcnow

auth_bp = Blueprint("auth", __name__, url_prefix="/auth/v1")


def _user_payload(user: AuthUser) -> dict:
  return {
    "id": user.id,
    "aud": "authenticated",
    "role": "authenticated",
    "email": user.email,
    "email_confirmed_at": iso(user.email_confirmed_at),
    "phone": "",
    "confirmed_at": iso(user.email_confirmed_at),
    "last_sign_in_at": iso(user.updated_at),
    "app_metadata": {},
    "user_metadata": user.raw_user_meta_data or {},
    "identities": [],
    "is_anonymous": False,
    "created_at": iso(user.created_at),
    "updated_at": iso(user.updated_at),
  }


def _user_response(user: AuthUser, access_token: str, refresh_token: str | None = None) -> dict:
  body: dict = {
    "access_token": access_token,
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": int((utcnow() + timedelta(hours=1)).timestamp()),
    "refresh_token": refresh_token or "",
    "user": _user_payload(user),
  }
  return body


def _assign_default_role(user: AuthUser) -> None:
  existing = UserRole.query.count()
  role = "admin" if existing == 0 else "consultant"
  db.session.add(UserRole(user_id=user.id, role=role))


def _issue_tokens(user: AuthUser) -> tuple[str, str]:
  access = create_access_token(user.id, user.email)
  refresh = new_refresh_token()
  db.session.add(
    RefreshToken(
      user_id=user.id,
      token_hash=hash_refresh_token(refresh),
      expires_at=utcnow() + timedelta(days=7),
    )
  )
  return access, refresh


@auth_bp.post("/signup")
def signup():
  data = request.get_json(silent=True) or {}
  email = (data.get("email") or "").strip().lower()
  password = data.get("password") or ""
  if not email or not password:
    return jsonify({"error": "invalid_request", "error_description": "email and password required"}), 400
  if AuthUser.query.filter_by(email=email).first():
    return jsonify({"error": "user_already_exists", "error_description": "User already registered"}), 422

  user = AuthUser(
    email=email,
    encrypted_password=hash_password(password),
    email_confirmed_at=utcnow(),
  )
  db.session.add(user)
  db.session.flush()
  _assign_default_role(user)
  access, refresh = _issue_tokens(user)
  db.session.commit()
  return jsonify(_user_response(user, access, refresh)), 200


@auth_bp.post("/token")
def token():
  grant_type = request.args.get("grant_type") or request.form.get("grant_type")
  body = request.get_json(silent=True) or {}

  if grant_type == "password":
    email = (
      request.form.get("email")
      or body.get("email")
      or ""
    ).strip().lower()
    password = request.form.get("password") or body.get("password") or ""
    user = AuthUser.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.encrypted_password):
      return jsonify({"error": "invalid_grant", "error_description": "Invalid login credentials"}), 400
    access, refresh = _issue_tokens(user)
    db.session.commit()
    return jsonify(_user_response(user, access, refresh))

  if grant_type == "refresh_token":
    refresh = request.form.get("refresh_token") or (request.get_json(silent=True) or {}).get("refresh_token")
    if not refresh:
      return jsonify({"error": "invalid_request"}), 400
    token_hash = hash_refresh_token(refresh)
    row = RefreshToken.query.filter_by(token_hash=token_hash, revoked_at=None).first()
    if not row or row.expires_at < utcnow():
      return jsonify({"error": "invalid_grant", "error_description": "Invalid refresh token"}), 401
    user = db.session.get(AuthUser, row.user_id)
    if not user:
      return jsonify({"error": "invalid_grant"}), 401
    row.revoked_at = utcnow()
    access, new_refresh = _issue_tokens(user)
    db.session.commit()
    return jsonify(_user_response(user, access, new_refresh))

  return jsonify({"error": "unsupported_grant_type"}), 400


def _authenticated_user() -> AuthUser | None:
  auth = request.headers.get("Authorization", "")
  if not auth.startswith("Bearer "):
    return None
  claims = decode_access_token(auth[7:])
  if not claims:
    return None
  return db.session.get(AuthUser, claims["sub"])


@auth_bp.get("/user")
def get_user():
  user = _authenticated_user()
  if not user:
    return jsonify({"error": "invalid_token"}), 401
  return jsonify(_user_payload(user))


@auth_bp.patch("/user")
def update_profile():
  user = _authenticated_user()
  if not user:
    return jsonify({"error": "invalid_token"}), 401

  data = request.get_json(silent=True) or {}

  if "email" in data and data["email"]:
    new_email = str(data["email"]).strip().lower()
    existing = AuthUser.query.filter_by(email=new_email).first()
    if existing and existing.id != user.id:
      return jsonify({"error": "email_in_use", "message": "email already in use"}), 422
    user.email = new_email

  if "display_name" in data or "name" in data:
    meta = dict(user.raw_user_meta_data or {})
    meta["display_name"] = (data.get("display_name") or data.get("name") or "").strip()
    user.raw_user_meta_data = meta

  if data.get("password"):
    if len(data["password"]) < 8:
      return jsonify({"message": "password must be at least 8 characters"}), 400
    user.encrypted_password = hash_password(data["password"])
    RefreshToken.query.filter_by(user_id=user.id, revoked_at=None).update({"revoked_at": utcnow()})

  user.updated_at = utcnow()

  consultant = db.session.scalar(select(Consultant).where(Consultant.user_id == user.id))
  if consultant:
    consultant.email = user.email
    display_name = (user.raw_user_meta_data or {}).get("display_name")
    if display_name:
      consultant.name = str(display_name).strip()
    consultant.updated_at = utcnow()

  db.session.commit()
  return jsonify(_user_payload(user))


@auth_bp.post("/logout")
def logout():
  auth = request.headers.get("Authorization", "")
  if auth.startswith("Bearer "):
    claims = decode_access_token(auth[7:])
    if claims:
      RefreshToken.query.filter_by(user_id=claims["sub"], revoked_at=None).update({"revoked_at": utcnow()})
      db.session.commit()
  return "", 204
