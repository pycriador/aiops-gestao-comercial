"""Flask application factory."""

import os
from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS

from app.api.auth_routes import auth_bp
from app.api.iam_routes import iam_bp
from app.api.rest_routes import rest_bp
from app.auth.permissions import ensure_default_roles
from app.config import Config
from app.extensions import db, jwt


def create_app(config_class: type = Config, *, init_db: bool = True) -> Flask:
  app = Flask(__name__)
  app.config.from_object(config_class)

  db.init_app(app)
  jwt.init_app(app)
  CORS(
    app,
    origins=app.config["CORS_ORIGINS"],
    supports_credentials=True,
    allow_headers=[
      "Content-Type",
      "Authorization",
      "apikey",
      "Apikey",
      "x-client-info",
      "X-Client-Info",
      "Prefer",
    ],
    expose_headers=["Content-Range"],
  )

  app.register_blueprint(auth_bp)
  app.register_blueprint(iam_bp)
  app.register_blueprint(rest_bp)

  @app.get("/health")
  def health():
    return jsonify({"status": "ok", "service": "agency-watch-backend"})

  @app.get("/")
  def root():
    return jsonify({
      "service": "Agency Watch Backend",
      "auth": "/auth/v1",
      "rest": "/rest/v1",
      "health": "/health",
    })

  if init_db:
    with app.app_context():
      uri = app.config["SQLALCHEMY_DATABASE_URI"]
      if uri.startswith("sqlite:///"):
        db_file = Path(uri.replace("sqlite:///", ""))
        db_file.parent.mkdir(parents=True, exist_ok=True)
      db.create_all()
      ensure_default_roles()
      if not app.debug and not os.getenv("_AGENCY_WATCH_QUIET"):
        safe = uri.split("@")[-1] if "@" in uri else uri
        print(f"[agency-watch] database → {safe}")

  return app
