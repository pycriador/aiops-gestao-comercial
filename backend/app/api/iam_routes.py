"""IAM administration API (/iam/v1)."""

from __future__ import annotations

import re

from sqlalchemy import func, select

from flask import Blueprint, jsonify, request

from app.auth.permissions import (
  PERMISSION_CATALOG,
  can_manage_roles,
  can_manage_users,
  data_scope_for_user,
  permissions_for_user,
  role_slugs_for_user,
)
from app.auth.security import decode_access_token, hash_password, iso
from app.extensions import db
from app.models import AuthUser, Consultant, IamRole, RefreshToken, UserRole, utcnow

iam_bp = Blueprint("iam", __name__, url_prefix="/iam/v1")

SLUG_RE = re.compile(r"^[a-z][a-z0-9_-]{1,62}$")


def _parse_auth() -> tuple[str | None, bool]:
  from flask import current_app

  apikey = request.headers.get("apikey") or request.headers.get("Apikey")
  service_key = current_app.config["API_SERVICE_KEY"]
  if apikey == service_key:
    return None, True

  auth = request.headers.get("Authorization", "")
  if auth.startswith("Bearer "):
    claims = decode_access_token(auth[7:])
    if claims:
      return claims.get("sub"), False
  return None, False


def _require_users_manage() -> str | None:
  user_id, service_role = _parse_auth()
  if not can_manage_users(user_id, service_role):
    return None
  return user_id


def _require_roles_manage() -> str | None:
  user_id, service_role = _parse_auth()
  if not can_manage_roles(user_id, service_role):
    return None
  return user_id


def _display_name(user: AuthUser) -> str:
  meta = user.raw_user_meta_data or {}
  return (meta.get("display_name") or meta.get("full_name") or "").strip()


def _user_dict(user: AuthUser) -> dict:
  roles = list(role_slugs_for_user(user.id))
  consultant = db.session.scalar(select(Consultant).where(Consultant.user_id == user.id))
  return {
    "id": user.id,
    "email": user.email,
    "display_name": _display_name(user) or user.email.split("@")[0],
    "roles": roles,
    "primary_role": roles[0] if roles else None,
    "permissions": sorted(permissions_for_user(user.id)),
    "data_scope": data_scope_for_user(user.id),
    "consultant_id": consultant.id if consultant else None,
    "consultant_name": consultant.name if consultant else None,
    "created_at": iso(user.created_at),
    "updated_at": iso(user.updated_at),
  }


def _role_dict(role: IamRole) -> dict:
  return {
    "slug": role.slug,
    "name": role.name,
    "description": role.description,
    "is_system": role.is_system,
    "data_scope": role.data_scope,
    "permissions": role.permissions or [],
    "created_at": iso(role.created_at),
    "updated_at": iso(role.updated_at),
  }


@iam_bp.get("/permissions")
def list_permissions():
  actor, service_role = _parse_auth()
  if not can_manage_users(actor, service_role) and not can_manage_roles(actor, service_role):
    if actor:
      return jsonify({"permissions": sorted(permissions_for_user(actor)), "catalog": PERMISSION_CATALOG})
    return jsonify({"message": "permission denied", "code": "42501"}), 403
  return jsonify({"catalog": PERMISSION_CATALOG})


@iam_bp.get("/me")
def me_permissions():
  user_id, _ = _parse_auth()
  if not user_id:
    return jsonify({"message": "permission denied", "code": "42501"}), 403
  return jsonify({
    "user_id": user_id,
    "roles": sorted(role_slugs_for_user(user_id)),
    "permissions": sorted(permissions_for_user(user_id)),
    "data_scope": data_scope_for_user(user_id),
  })


@iam_bp.get("/roles")
def list_roles():
  if _require_roles_manage() is None and _require_users_manage() is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403
  roles = db.session.scalars(select(IamRole).order_by(IamRole.name)).all()
  return jsonify([_role_dict(r) for r in roles])


@iam_bp.post("/roles")
def create_role():
  if _require_roles_manage() is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  data = request.get_json(silent=True) or {}
  slug = (data.get("slug") or "").strip().lower()
  name = (data.get("name") or "").strip()
  if not slug or not name:
    return jsonify({"message": "slug and name are required"}), 400
  if not SLUG_RE.match(slug):
    return jsonify({"message": "invalid slug format"}), 400
  if db.session.get(IamRole, slug):
    return jsonify({"message": "role already exists"}), 422

  perms = data.get("permissions") or []
  if not isinstance(perms, list):
    return jsonify({"message": "permissions must be a list"}), 400

  role = IamRole(
    slug=slug,
    name=name,
    description=(data.get("description") or "").strip() or None,
    is_system=False,
    data_scope=data.get("data_scope") or "own",
    permissions=perms,
  )
  db.session.add(role)
  db.session.commit()
  return jsonify(_role_dict(role)), 201


@iam_bp.patch("/roles/<slug>")
def update_role(slug: str):
  if _require_roles_manage() is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  role = db.session.get(IamRole, slug)
  if not role:
    return jsonify({"message": "role not found"}), 404

  data = request.get_json(silent=True) or {}
  if "name" in data and data["name"]:
    role.name = str(data["name"]).strip()
  if "description" in data:
    role.description = (data.get("description") or "").strip() or None
  if "data_scope" in data and data["data_scope"] in ("all", "own"):
    if role.is_system and role.slug == "admin":
      role.data_scope = "all"
    elif not role.is_system or role.slug != "consultant":
      role.data_scope = data["data_scope"]
  if "permissions" in data and isinstance(data["permissions"], list):
    if role.slug == "admin":
      role.permissions = ["*"]
    else:
      role.permissions = [p for p in data["permissions"] if p in PERMISSION_CATALOG or p == "*"]

  role.updated_at = utcnow()
  db.session.commit()
  return jsonify(_role_dict(role))


@iam_bp.delete("/roles/<slug>")
def delete_role(slug: str):
  if _require_roles_manage() is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  role = db.session.get(IamRole, slug)
  if not role:
    return "", 204
  if role.is_system:
    return jsonify({"message": "system roles cannot be deleted"}), 403

  in_use = db.session.scalar(select(func.count()).select_from(UserRole).where(UserRole.role == slug))
  if in_use:
    return jsonify({"message": "role is assigned to users"}), 409

  db.session.delete(role)
  db.session.commit()
  return "", 204


@iam_bp.get("/users")
def list_users():
  if _require_users_manage() is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  users = db.session.scalars(select(AuthUser).order_by(AuthUser.email)).all()
  return jsonify([_user_dict(u) for u in users])


@iam_bp.post("/users")
def create_user():
  actor = _require_users_manage()
  if actor is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  data = request.get_json(silent=True) or {}
  email = (data.get("email") or "").strip().lower()
  password = data.get("password") or ""
  display_name = (data.get("display_name") or data.get("name") or "").strip()
  role_slug = (data.get("role") or data.get("primary_role") or "consultant").strip()
  consultant_id = data.get("consultant_id")

  if not email or not password:
    return jsonify({"message": "email and password are required"}), 400
  if len(password) < 8:
    return jsonify({"message": "password must be at least 8 characters"}), 400
  if AuthUser.query.filter_by(email=email).first():
    return jsonify({"message": "email already registered"}), 422
  if not db.session.get(IamRole, role_slug):
    return jsonify({"message": "invalid role"}), 400

  user = AuthUser(
    email=email,
    encrypted_password=hash_password(password),
    email_confirmed_at=utcnow(),
    raw_user_meta_data={"display_name": display_name} if display_name else {},
  )
  db.session.add(user)
  db.session.flush()
  db.session.add(UserRole(user_id=user.id, role=role_slug))

  if consultant_id:
    consultant = db.session.get(Consultant, consultant_id)
    if consultant:
      consultant.user_id = user.id
      consultant.email = email
      if display_name:
        consultant.name = display_name
      consultant.updated_at = utcnow()
  elif role_slug == "consultant" and display_name:
    db.session.add(
      Consultant(user_id=user.id, name=display_name, email=email, active=True)
    )

  db.session.commit()
  return jsonify(_user_dict(user)), 201


@iam_bp.patch("/users/<user_id>")
def update_user(user_id: str):
  actor = _require_users_manage()
  if actor is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403

  user = db.session.get(AuthUser, user_id)
  if not user:
    return jsonify({"message": "user not found"}), 404

  data = request.get_json(silent=True) or {}

  if "email" in data and data["email"]:
    new_email = str(data["email"]).strip().lower()
    existing = AuthUser.query.filter_by(email=new_email).first()
    if existing and existing.id != user.id:
      return jsonify({"message": "email already in use"}), 422
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

  if "role" in data or "primary_role" in data:
    role_slug = (data.get("role") or data.get("primary_role") or "").strip()
    if role_slug and db.session.get(IamRole, role_slug):
      UserRole.query.filter_by(user_id=user.id).delete()
      db.session.add(UserRole(user_id=user.id, role=role_slug))

  if "consultant_id" in data:
    Consultant.query.filter_by(user_id=user.id).update({"user_id": None})
    if data["consultant_id"]:
      consultant = db.session.get(Consultant, data["consultant_id"])
      if consultant:
        consultant.user_id = user.id
        consultant.updated_at = utcnow()

  user.updated_at = utcnow()
  db.session.commit()
  return jsonify(_user_dict(user))


@iam_bp.delete("/users/<user_id>")
def delete_user(user_id: str):
  actor = _require_users_manage()
  if actor is None:
    return jsonify({"message": "permission denied", "code": "42501"}), 403
  if actor == user_id:
    return jsonify({"message": "cannot delete your own account"}), 403

  user = db.session.get(AuthUser, user_id)
  if not user:
    return "", 204

  Consultant.query.filter_by(user_id=user.id).update({"user_id": None})
  db.session.delete(user)
  db.session.commit()
  return "", 204
