import os
from pathlib import Path
from urllib.parse import quote_plus

BASE_DIR = Path(__file__).resolve().parent.parent


def build_database_url() -> str:
  """Resolve SQLAlchemy URI: DATABASE_URL > PostgreSQL DB_* vars > SQLite fallback."""
  explicit = os.getenv("DATABASE_URL")
  if explicit:
    return explicit

  host = os.getenv("DB_HOST")
  port = os.getenv("DB_PORT", "5432")
  name = os.getenv("DB_NAME")
  user = os.getenv("DB_APP_USER") or os.getenv("DB_USER")
  password = os.getenv("DB_APP_PASSWORD") or os.getenv("DB_PASSWORD", "").strip('"')

  if host and name and user and password:
    safe_user = quote_plus(user)
    safe_pass = quote_plus(password)
    return f"postgresql+psycopg://{safe_user}:{safe_pass}@{host}:{port}/{name}"

  return f"sqlite:///{BASE_DIR / 'data' / 'agency_watch.db'}"


class Config:
  SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
  JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
  JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
  JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "3600"))
  JWT_REFRESH_TOKEN_EXPIRES = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES", "604800"))

  # API keys consumed by the frontend
  API_ANON_KEY = os.getenv(
    "API_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImFnZW5jeS13YXRjaC1sb2NhbCJ9.local-anon-key",
  )
  API_SERVICE_KEY = os.getenv(
    "API_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoiYWdlbmN5LXdhdGNoLWxvY2FsIn0.local-service-key",
  )

  SQLALCHEMY_DATABASE_URI = build_database_url()
  SQLALCHEMY_TRACK_MODIFICATIONS = False
  SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

  cors_env = os.getenv("CORS_ORIGINS", "").strip()
  _cors_list = [o.strip() for o in cors_env.split(",") if o.strip()]
  if os.getenv("FLASK_DEBUG", "0") == "1":
    # Any localhost port in dev (Vite may use 8080, 8081, …)
    _cors_list.extend([r"http://localhost:\d+", r"http://127\.0\.0\.1:\d+"])
  CORS_ORIGINS = _cors_list or [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
  ]
