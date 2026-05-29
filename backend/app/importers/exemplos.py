"""Import portfolio data from semicolon-separated CSV exports in exemplos/."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from app.extensions import db
from app.models import (
  AgencyInteraction,
  AuthUser,
  Consultant,
  RealEstateAgency,
  SlackEvent,
  UserRole,
)


def _parse_dt(value: str | None) -> datetime | None:
  if not value or not value.strip():
    return None
  raw = value.strip()
  if raw.endswith("+00"):
    raw = raw[:-3] + "+00:00"
  return datetime.fromisoformat(raw)


def _parse_bool(value: str | None) -> bool | None:
  if value is None or not str(value).strip():
    return None
  return str(value).strip().lower() in {"true", "1", "yes", "sim"}


def _parse_int(value: str | None, default: int | None = None) -> int | None:
  if value is None or not str(value).strip():
    return default
  return int(float(str(value).strip()))


def _parse_optional_uuid(value: str | None) -> str | None:
  if not value or not value.strip():
    return None
  return value.strip()


def _read_csv(path: Path) -> list[dict[str, str]]:
  with path.open(newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle, delimiter=";")
    return [dict(row) for row in reader]


def _resolve_user_id(exported_id: str | None, known_ids: set[str], fallback: str | None) -> str | None:
  uid = _parse_optional_uuid(exported_id)
  if uid and uid in known_ids:
    return uid
  return fallback


def _reconcile_agency_stats(agency_ids: set[str]) -> None:
  """Recalculate interaction counters after bulk import."""
  for agency_id in agency_ids:
    agency = db.session.get(RealEstateAgency, agency_id)
    if not agency:
      continue
    interactions = (
      AgencyInteraction.query.filter_by(agency_id=agency_id)
      .order_by(AgencyInteraction.interaction_date.asc())
      .all()
    )
    agency.total_interactions = len(interactions)
    if not interactions:
      continue
    latest = interactions[-1]
    agency.last_interaction_date = latest.interaction_date
    if latest.status_after:
      agency.negotiation_status = latest.status_after
    if latest.next_steps is not None:
      agency.next_steps = latest.next_steps
    if latest.feedback is not None:
      agency.feedback = latest.feedback
    if latest.current_offer is not None:
      agency.current_offer = latest.current_offer
    if latest.contract_stock is not None:
      agency.contract_stock = latest.contract_stock
    if latest.c_level_support_needed is not None:
      agency.c_level_support_needed = latest.c_level_support_needed


def _clear_portfolio_data() -> None:
  SlackEvent.query.delete()
  AgencyInteraction.query.delete()
  RealEstateAgency.query.delete()
  Consultant.query.delete()
  db.session.flush()


def import_exemplos(data_dir: Path, *, replace: bool = False) -> dict[str, int]:
  """Import CSV exports. Returns counts per table."""
  if not data_dir.is_dir():
    raise FileNotFoundError(f"Directory not found: {data_dir}")

  counts = {
    "consultants": 0,
    "agencies": 0,
    "interactions": 0,
    "slack_events": 0,
    "user_roles": 0,
  }

  known_user_ids = {u.id for u in AuthUser.query.all()}
  admin_user = (
    db.session.query(AuthUser)
    .join(UserRole, UserRole.user_id == AuthUser.id)
    .filter(UserRole.role == "admin")
    .first()
  )
  user_fallback = admin_user.id if admin_user else None

  if replace:
    _clear_portfolio_data()
  elif RealEstateAgency.query.count() > 0:
    raise RuntimeError(
      "Database already has agencies. Re-run with --replace to clear portfolio data first."
    )

  consultants_file = next(data_dir.glob("consultants-export-*.csv"), None)
  agencies_file = next(data_dir.glob("real_estate_agencies-export-*.csv"), None)
  interactions_file = next(data_dir.glob("agency_interactions-export-*.csv"), None)
  slack_file = next(data_dir.glob("slack_events-export-*.csv"), None)
  roles_file = next(data_dir.glob("user_roles-export-*.csv"), None)

  if consultants_file:
    for row in _read_csv(consultants_file):
      consultant_id = row["id"].strip()
      if db.session.get(Consultant, consultant_id):
        continue
      db.session.add(
        Consultant(
          id=consultant_id,
          user_id=_resolve_user_id(row.get("user_id"), known_user_ids, None),
          name=row["name"].strip(),
          phone=_parse_optional_uuid(row.get("phone")),
          email=_parse_optional_uuid(row.get("email")),
          regional=_parse_optional_uuid(row.get("regional")),
          active=_parse_bool(row.get("active")) if _parse_bool(row.get("active")) is not None else True,
          slack_user_id=_parse_optional_uuid(row.get("slack_user_id")),
          created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
          updated_at=_parse_dt(row.get("updated_at")) or datetime.now(timezone.utc),
        )
      )
      counts["consultants"] += 1
    db.session.flush()

  consultant_ids = {c.id for c in Consultant.query.all()}

  if agencies_file:
    for row in _read_csv(agencies_file):
      agency_id = row["id"].strip()
      if db.session.get(RealEstateAgency, agency_id):
        continue
      consultant_id = _parse_optional_uuid(row.get("consultant_id"))
      if consultant_id and consultant_id not in consultant_ids:
        consultant_id = None

      db.session.add(
        RealEstateAgency(
          id=agency_id,
          name=row["name"].strip(),
          city=row["city"].strip(),
          state=row["state"].strip()[:2].upper(),
          regional_director=_parse_optional_uuid(row.get("regional_director")),
          consultant_id=consultant_id,
          contract_stock=_parse_int(row.get("contract_stock"), 0) or 0,
          current_guarantor=_parse_optional_uuid(row.get("current_guarantor")),
          guarantor_type=_parse_optional_uuid(row.get("guarantor_type")),
          main_contact=_parse_optional_uuid(row.get("main_contact")),
          contact_role=_parse_optional_uuid(row.get("contact_role")),
          negotiation_status=(row.get("negotiation_status") or "Pipeline de Prospecção").strip(),
          current_offer=_parse_optional_uuid(row.get("current_offer")),
          c_level_support_needed=_parse_bool(row.get("c_level_support_needed")) or False,
          next_steps=_parse_optional_uuid(row.get("next_steps")),
          feedback=_parse_optional_uuid(row.get("feedback")),
          last_interaction_date=_parse_dt(row.get("last_interaction_date")),
          total_interactions=_parse_int(row.get("total_interactions"), 0) or 0,
          created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
          updated_at=_parse_dt(row.get("updated_at")) or datetime.now(timezone.utc),
          created_by=_resolve_user_id(row.get("created_by"), known_user_ids, user_fallback),
          updated_by=_resolve_user_id(row.get("updated_by"), known_user_ids, user_fallback),
        )
      )
      counts["agencies"] += 1
    db.session.flush()

  agency_ids = {a.id for a in RealEstateAgency.query.all()}

  if interactions_file:
    with db.session.no_autoflush:
      for row in _read_csv(interactions_file):
        interaction_id = row["id"].strip()
        agency_id = row["agency_id"].strip()
        if agency_id not in agency_ids or db.session.get(AgencyInteraction, interaction_id):
          continue
        db.session.add(
          AgencyInteraction(
            id=interaction_id,
            agency_id=agency_id,
            interaction_date=_parse_dt(row.get("interaction_date")) or datetime.now(timezone.utc),
            interaction_type=_parse_optional_uuid(row.get("interaction_type")),
            feedback=_parse_optional_uuid(row.get("feedback")),
            next_steps=_parse_optional_uuid(row.get("next_steps")),
            status_before=_parse_optional_uuid(row.get("status_before")),
            status_after=_parse_optional_uuid(row.get("status_after")),
            c_level_support_needed=_parse_bool(row.get("c_level_support_needed")),
            current_offer=_parse_optional_uuid(row.get("current_offer")),
            contract_stock=_parse_int(row.get("contract_stock")),
            source=(row.get("source") or "web").strip(),
            created_by=_resolve_user_id(row.get("created_by"), known_user_ids, user_fallback),
            created_by_name=_parse_optional_uuid(row.get("created_by_name")),
            created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
          )
        )
        counts["interactions"] += 1
    db.session.flush()
    _reconcile_agency_stats(agency_ids)

  if slack_file:
    for row in _read_csv(slack_file):
      event_id = row["id"].strip()
      if db.session.get(SlackEvent, event_id):
        continue
      payload_raw = row.get("payload") or "{}"
      try:
        payload = json.loads(payload_raw)
      except json.JSONDecodeError:
        payload = {"raw": payload_raw}

      response_raw = row.get("response")
      response = None
      if response_raw and response_raw.strip():
        try:
          response = json.loads(response_raw)
        except json.JSONDecodeError:
          response = {"raw": response_raw}

      consultant_id = _parse_optional_uuid(row.get("consultant_id"))
      if consultant_id and consultant_id not in consultant_ids:
        consultant_id = None

      db.session.add(
        SlackEvent(
          id=event_id,
          event_type=row["event_type"].strip(),
          slack_user_id=_parse_optional_uuid(row.get("slack_user_id")),
          slack_team_id=_parse_optional_uuid(row.get("slack_team_id")),
          channel_id=_parse_optional_uuid(row.get("channel_id")),
          consultant_id=consultant_id,
          payload=payload,
          response=response,
          status=(row.get("status") or "received").strip(),
          error_message=_parse_optional_uuid(row.get("error_message")),
          created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
        )
      )
      counts["slack_events"] += 1

  if roles_file:
    for row in _read_csv(roles_file):
      user_id = _parse_optional_uuid(row.get("user_id"))
      role = (row.get("role") or "").strip()
      if not user_id or user_id not in known_user_ids or not role:
        continue
      exists = UserRole.query.filter_by(user_id=user_id, role=role).first()
      if exists:
        continue
      db.session.add(
        UserRole(
          id=row["id"].strip(),
          user_id=user_id,
          role=role,
          created_at=_parse_dt(row.get("created_at")) or datetime.now(timezone.utc),
        )
      )
      counts["user_roles"] += 1

  db.session.commit()
  return counts
