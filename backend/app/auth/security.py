"""Password hashing and JWT helpers (enterprise-grade: bcrypt + HS256/RS256)."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import current_app


def hash_password(password: str) -> str:
  return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
  try:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
  except ValueError:
    return False


def hash_refresh_token(token: str) -> str:
  return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_refresh_token() -> str:
  return secrets.token_urlsafe(48)


def _jwt_secret() -> str:
  return current_app.config["JWT_SECRET_KEY"]


def _jwt_algorithm() -> str:
  return current_app.config["JWT_ALGORITHM"]


def create_access_token(user_id: str, email: str, role: str = "authenticated") -> str:
  now = datetime.now(timezone.utc)
  exp = now + timedelta(seconds=current_app.config["JWT_ACCESS_TOKEN_EXPIRES"])
  payload = {
    "sub": user_id,
    "email": email,
    "role": role,
    "aud": "authenticated",
    "iss": "agency-watch-local",
    "iat": int(now.timestamp()),
    "exp": int(exp.timestamp()),
  }
  return jwt.encode(payload, _jwt_secret(), algorithm=_jwt_algorithm())


def decode_access_token(token: str) -> dict | None:
  try:
    return jwt.decode(
      token,
      _jwt_secret(),
      algorithms=[_jwt_algorithm()],
      audience="authenticated",
      options={"require": ["exp", "sub"]},
    )
  except jwt.PyJWTError:
    return None


def iso(dt: datetime | None) -> str | None:
  if dt is None:
    return None
  if dt.tzinfo is None:
    dt = dt.replace(tzinfo=timezone.utc)
  return dt.isoformat().replace("+00:00", "Z")
