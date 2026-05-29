"""REST API for database tables (/rest/v1)."""

import json
import re
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, jsonify, request
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import DeclarativeBase

from app.auth.permissions import can_manage_users, has_permission
from app.auth.rls import (
  can_delete_agency,
  can_manage_consultants,
  can_read_consultants,
  can_write_agency,
  consultant_id_for_user,
  has_role,
  is_privileged,
  user_roles,
)
from app.auth.security import decode_access_token, iso
from app.extensions import db
from app.models import (
  AgencyInteraction,
  BotSession,
  Consultant,
  HubspotMapping,
  RealEstateAgency,
  SlackEvent,
  SlackNotification,
  SlackSession,
  TABLE_MODEL_MAP,
  UserRole,
  WhatsappMessage,
  new_uuid,
  utcnow,
)

rest_bp = Blueprint("rest", __name__, url_prefix="/rest/v1")


def _parse_auth() -> tuple[str | None, bool]:
  """Return (user_id, is_service_role)."""
  apikey = request.headers.get("apikey") or request.headers.get("Apikey")
  auth = request.headers.get("Authorization", "")
  from flask import current_app

  service_key = current_app.config["API_SERVICE_KEY"]
  if apikey == service_key:
    return None, True

  if auth.startswith("Bearer "):
    claims = decode_access_token(auth[7:])
    if claims:
      return claims.get("sub"), False
  return None, False


def _model_to_dict(obj: Any, columns: list[str] | None = None) -> dict:
  data = {}
  mapper = obj.__class__.__mapper__
  for col in mapper.columns:
    if columns and col.key not in columns and col.name not in columns:
      continue
    val = getattr(obj, col.key)
    if isinstance(val, datetime):
      data[col.key] = iso(val)
    elif isinstance(val, dict):
      data[col.key] = val
    else:
      data[col.key] = val
  return data


def _parse_select(select_str: str) -> tuple[list[str], dict[str, list[str]]]:
  """Parse select=*,consultants(name) -> columns, embeds."""
  if not select_str or select_str == "*":
    return ["*"], {}
  embeds: dict[str, list[str]] = {}
  cols: list[str] = []
  for part in select_str.split(","):
    part = part.strip()
    m = re.match(r"(\w+)\(([^)]+)\)", part)
    if m:
      rel, inner = m.group(1), m.group(2)
      embeds[rel] = [c.strip() for c in inner.split(",")]
    else:
      cols.append(part)
  return cols or ["*"], embeds


def _apply_text_search(query, model):
  search_q = (request.args.get("q") or "").strip()
  if not search_q or model is not Consultant:
    return query
  pattern = f"%{search_q}%"
  email_col = func.coalesce(Consultant.email, "")
  return query.where(
    or_(
      func.lower(Consultant.name).like(pattern.lower()),
      func.lower(email_col).like(pattern.lower()),
    )
  )


def _filtered_select(model, user_id: str | None, service_role: bool):
  query = select(model)
  query = _apply_filters(query, model, user_id, service_role)
  query = _apply_text_search(query, model)
  return query


def _apply_filters(query, model, user_id: str | None, service_role: bool):
  for key, raw in request.args.items():
    if key in ("select", "order", "limit", "offset", "or", "and", "q"):
      continue
    if not raw:
      continue

    col = getattr(model, key, None)
    if col is None:
      continue

    for token in raw.split(","):
      token = token.strip()
      if token == "not.is.null":
        query = query.where(col.isnot(None))
        continue
      if token == "is.null":
        query = query.where(col.is_(None))
        continue
      if "." not in token:
        continue
      op, val = token.split(".", 1)
      if op == "eq":
        if val == "true":
          query = query.where(col.is_(True))
        elif val == "false":
          query = query.where(col.is_(False))
        else:
          query = query.where(col == val)
      elif op == "ilike":
        query = query.where(func.lower(col).like(val.lower()))
      elif op == "like":
        query = query.where(col.like(val))
      elif op == "gte":
        query = query.where(col >= val)
      elif op == "gt":
        query = query.where(col > val)
      elif op == "in":
        inner = val.strip("()")
        query = query.where(col.in_([v.strip() for v in inner.split(",")]))

  return _apply_rls(query, model, user_id, service_role)


def _apply_rls(query, model, user_id: str | None, service_role: bool):
  if service_role:
    return query
  if model is RealEstateAgency:
    if is_privileged(user_id):
      return query
    cid = consultant_id_for_user(user_id)
    if not cid:
      return query.where(False)
    return query.where(RealEstateAgency.consultant_id == cid)
  if model is AgencyInteraction:
    if is_privileged(user_id):
      return query
    cid = consultant_id_for_user(user_id)
    if not cid:
      return query.where(False)
    subq = select(RealEstateAgency.id).where(RealEstateAgency.consultant_id == cid)
    return query.where(AgencyInteraction.agency_id.in_(subq))
  if model is UserRole:
    if has_role(user_id, "admin") or can_manage_users(user_id, service_role):
      return query
    return query.where(UserRole.user_id == user_id)
  if model in (WhatsappMessage, BotSession):
    if has_permission(user_id, "bot.view") or service_role:
      return query
    return query.where(False)
  if model in (SlackEvent, SlackSession, SlackNotification):
    if has_permission(user_id, "bot.view") or has_permission(user_id, "settings.slack") or service_role:
      return query
    return query.where(False)
  if model is Consultant:
    if can_read_consultants(user_id, service_role) or is_privileged(user_id):
      return query
    cid = consultant_id_for_user(user_id)
    if cid:
      return query.where(Consultant.id == cid)
    return query.where(False)
  if model is HubspotMapping:
    return query
  return query


def _embed(row_dict: dict, embeds: dict[str, list[str]], parent_model) -> dict:
  if parent_model is RealEstateAgency and "consultants" in embeds:
    cid = row_dict.get("consultant_id")
    if cid:
      c = db.session.get(Consultant, cid)
      if c:
        row_dict["consultants"] = {k: getattr(c, k) for k in embeds["consultants"] if hasattr(c, k)}
      else:
        row_dict["consultants"] = None
    else:
      row_dict["consultants"] = None
  if parent_model in (WhatsappMessage, BotSession) and "consultants" in embeds:
    cid = row_dict.get("consultant_id")
    if cid:
      c = db.session.get(Consultant, cid)
      row_dict["consultants"] = {k: getattr(c, k) for k in embeds["consultants"] if hasattr(c, k)} if c else None
    else:
      row_dict["consultants"] = None
  if parent_model is AgencyInteraction and "real_estate_agencies" in embeds:
    aid = row_dict.get("agency_id")
    if aid:
      a = db.session.get(RealEstateAgency, aid)
      row_dict["real_estate_agencies"] = {k: getattr(a, k) for k in embeds["real_estate_agencies"] if hasattr(a, k)} if a else None
  if parent_model is RealEstateAgency and "consultants" in embeds and isinstance(embeds.get("consultants"), list):
    pass  # handled above
  # slack cron nested: consultants:consultant_id(...)
  return row_dict


def _apply_order(query, model):
  order_param = request.args.get("order", "")
  if not order_param:
    return query
  for part in order_param.split(","):
    part = part.strip()
    if ".desc" in part:
      field = part.replace(".desc", "")
      col = getattr(model, field, None)
      if col is not None:
        query = query.order_by(desc(col))
    elif ".asc" in part:
      field = part.replace(".asc", "")
      col = getattr(model, field, None)
      if col is not None:
        query = query.order_by(asc(col))
    else:
      col = getattr(model, part, None)
      if col is not None:
        query = query.order_by(asc(col))
  return query


@rest_bp.route("/<table>", methods=["GET", "POST", "PATCH", "DELETE"])
@rest_bp.route("/<table>/", methods=["GET", "POST", "PATCH", "DELETE"])
def table_route(table: str):
  model = TABLE_MODEL_MAP.get(table)
  if not model:
    return jsonify({"message": f"Table {table} not found", "code": "PGRST205"}), 404

  user_id, service_role = _parse_auth()

  if request.method == "GET":
    return _handle_get(model, user_id, service_role)
  if request.method == "POST":
    return _handle_post(table, model, user_id, service_role)
  if request.method == "PATCH":
    return _handle_patch(model, user_id, service_role)
  if request.method == "DELETE":
    return _handle_delete(model, user_id, service_role)
  return jsonify({"error": "method not allowed"}), 405


def _handle_get(model, user_id: str | None, service_role: bool):
  cols, embeds = _parse_select(request.args.get("select", "*"))
  query = _filtered_select(model, user_id, service_role)
  query = _apply_order(query, model)

  prefer = request.headers.get("Prefer", "")
  want_count = "count=exact" in prefer

  total: int | None = None
  if want_count:
    total = db.session.scalar(select(func.count()).select_from(query.subquery()))

  offset = request.args.get("offset")
  if offset:
    query = query.offset(int(offset))

  limit = request.args.get("limit")
  if limit:
    query = query.limit(int(limit))

  rows = db.session.scalars(query).all()
  result = []
  for row in rows:
    d = _model_to_dict(row, None if "*" in cols else cols)
    d = _embed(d, embeds, model)
    result.append(d)

  if "single" in prefer or request.args.get("limit") == "1":
    if not result:
      return jsonify({"message": "JSON object requested, multiple (or no) rows returned", "code": "PGRST116"}), 406
    return jsonify(result[0])

  response = jsonify(result)
  if want_count and total is not None:
    start = int(offset or 0)
    end = start + len(result) - 1 if result else max(start - 1, 0)
    response.headers["Content-Range"] = f"{start}-{end}/{total}"
  return response


def _handle_post(table: str, model, user_id: str | None, service_role: bool):
  payload = request.get_json(silent=True)
  if payload is None:
    return jsonify({"message": "Invalid JSON"}), 400

  items = payload if isinstance(payload, list) else [payload]
  created = []

  for item in items:
    if model is RealEstateAgency and not can_write_agency(user_id, None, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is Consultant and not can_manage_consultants(user_id, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is AgencyInteraction:
      agency = db.session.get(RealEstateAgency, item.get("agency_id"))
      if not agency or not can_write_agency(user_id, agency, service_role):
        return jsonify({"message": "permission denied", "code": "42501"}), 403

    obj = model()
    for k, v in item.items():
      if hasattr(obj, k):
        setattr(obj, k, v)
    if hasattr(obj, "id") and not getattr(obj, "id", None):
      obj.id = new_uuid()
    if model is BotSession or model is SlackSession:
      if not getattr(obj, "expires_at", None):
        from datetime import timedelta
        obj.expires_at = utcnow() + timedelta(hours=24 if model is BotSession else 2)
    db.session.add(obj)
    db.session.flush()
    created.append(_model_to_dict(obj))

  db.session.commit()
  prefer = request.headers.get("Prefer", "")
  if "return=representation" in prefer:
    if len(created) == 1:
      return jsonify(created[0]), 201
    return jsonify(created), 201
  return "", 201


def _handle_patch(model, user_id: str | None, service_role: bool):
  payload = request.get_json(silent=True) or {}
  query = _filtered_select(model, user_id, service_role)
  rows = db.session.scalars(query).all()
  if not rows:
    return jsonify({"message": "No rows found", "code": "PGRST116"}), 404

  for row in rows:
    if model is RealEstateAgency and not can_write_agency(user_id, row, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is Consultant and not can_manage_consultants(user_id, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is UserRole and not can_manage_users(user_id, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    for k, v in payload.items():
      if hasattr(row, k):
        setattr(row, k, v)
    if hasattr(row, "updated_at"):
      row.updated_at = utcnow()

  db.session.commit()
  prefer = request.headers.get("Prefer", "")
  if "return=representation" in prefer:
    return jsonify([_model_to_dict(r) for r in rows])
  return "", 204


def _handle_delete(model, user_id: str | None, service_role: bool):
  query = _filtered_select(model, user_id, service_role)
  rows = db.session.scalars(query).all()
  if not rows:
    return "", 204

  for row in rows:
    if model is RealEstateAgency and not can_delete_agency(user_id, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is Consultant and not can_manage_consultants(user_id, service_role):
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is AgencyInteraction and not has_permission(user_id, "portfolio.write") and not service_role:
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    if model is HubspotMapping and not has_permission(user_id, "settings.hubspot") and not is_privileged(user_id) and not service_role:
      return jsonify({"message": "permission denied", "code": "42501"}), 403
    db.session.delete(row)

  db.session.commit()
  return "", 204


@rest_bp.post("/rpc/has_role")
def rpc_has_role():
  user_id, service_role = _parse_auth()
  body = request.get_json(silent=True) or {}
  target_user = body.get("_user_id") or body.get("user_id")
  role = body.get("_role") or body.get("role")
  if service_role or user_id:
    result = has_role(target_user, role)
    return jsonify(result)
  return jsonify(False)
