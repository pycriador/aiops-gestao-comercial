"""SQLAlchemy models for Agency Watch."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
  Boolean,
  DateTime,
  ForeignKey,
  Integer,
  String,
  Text,
  UniqueConstraint,
  Uuid,
  event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.extensions import db


def utcnow() -> datetime:
  return datetime.now(timezone.utc)


def new_uuid() -> str:
  return str(uuid.uuid4())


class AuthUser(db.Model):
  __tablename__ = "auth_users"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
  encrypted_password: Mapped[str] = mapped_column(String(255), nullable=False)
  email_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
  raw_user_meta_data: Mapped[dict] = mapped_column(JSON, default=dict)

  roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
  refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RefreshToken(db.Model):
  __tablename__ = "refresh_tokens"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="CASCADE"), index=True)
  token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
  expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

  user: Mapped[AuthUser] = relationship(back_populates="refresh_tokens")


class UserRole(db.Model):
  __tablename__ = "user_roles"
  __table_args__ = (UniqueConstraint("user_id", "role", name="uq_user_roles_user_role"),)

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="CASCADE"), index=True)
  role: Mapped[str] = mapped_column(String(64), nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

  user: Mapped[AuthUser] = relationship(back_populates="roles")


class IamRole(db.Model):
  __tablename__ = "iam_roles"

  slug: Mapped[str] = mapped_column(String(64), primary_key=True)
  name: Mapped[str] = mapped_column(String(128), nullable=False)
  description: Mapped[str | None] = mapped_column(Text)
  is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
  data_scope: Mapped[str] = mapped_column(String(16), default="own", nullable=False)
  permissions: Mapped[list] = mapped_column(JSON, default=list)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Consultant(db.Model):
  __tablename__ = "consultants"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  user_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="SET NULL"), index=True)
  name: Mapped[str] = mapped_column(String(255), nullable=False)
  phone: Mapped[str | None] = mapped_column(String(32), index=True)
  email: Mapped[str | None] = mapped_column(String(255))
  regional: Mapped[str | None] = mapped_column(String(128))
  active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
  slack_user_id: Mapped[str | None] = mapped_column(String(64), index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

  agencies: Mapped[list["RealEstateAgency"]] = relationship(back_populates="consultant")


class RealEstateAgency(db.Model):
  __tablename__ = "real_estate_agencies"
  __table_args__ = (
    UniqueConstraint("name", "city", "state", name="agencies_dedupe_uq"),
  )

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  name: Mapped[str] = mapped_column(String(255), nullable=False)
  city: Mapped[str] = mapped_column(String(128), nullable=False)
  state: Mapped[str] = mapped_column(String(2), nullable=False)
  regional_director: Mapped[str | None] = mapped_column(String(255))
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("consultants.id", ondelete="SET NULL"), index=True)
  contract_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
  current_guarantor: Mapped[str | None] = mapped_column(String(255))
  guarantor_type: Mapped[str | None] = mapped_column(String(64))
  main_contact: Mapped[str | None] = mapped_column(String(255))
  contact_role: Mapped[str | None] = mapped_column(String(128))
  negotiation_status: Mapped[str] = mapped_column(String(64), default="Pipeline de Prospecção", nullable=False)
  current_offer: Mapped[str | None] = mapped_column(Text)
  c_level_support_needed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
  next_steps: Mapped[str | None] = mapped_column(Text)
  feedback: Mapped[str | None] = mapped_column(Text)
  last_interaction_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  total_interactions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
  created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="SET NULL"))
  updated_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="SET NULL"))

  consultant: Mapped[Consultant | None] = relationship(back_populates="agencies")
  interactions: Mapped[list["AgencyInteraction"]] = relationship(back_populates="agency", cascade="all, delete-orphan")
  hubspot_mapping: Mapped["HubspotMapping | None"] = relationship(back_populates="agency", uselist=False, cascade="all, delete-orphan")


class AgencyInteraction(db.Model):
  __tablename__ = "agency_interactions"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  agency_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("real_estate_agencies.id", ondelete="CASCADE"), index=True)
  interaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  interaction_type: Mapped[str | None] = mapped_column(String(64))
  feedback: Mapped[str | None] = mapped_column(Text)
  next_steps: Mapped[str | None] = mapped_column(Text)
  status_before: Mapped[str | None] = mapped_column(String(64))
  status_after: Mapped[str | None] = mapped_column(String(64))
  c_level_support_needed: Mapped[bool | None] = mapped_column(Boolean)
  current_offer: Mapped[str | None] = mapped_column(Text)
  contract_stock: Mapped[int | None] = mapped_column(Integer)
  source: Mapped[str] = mapped_column(String(16), default="web", nullable=False)
  created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("auth_users.id", ondelete="SET NULL"))
  created_by_name: Mapped[str | None] = mapped_column(String(255))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

  agency: Mapped[RealEstateAgency] = relationship(back_populates="interactions")


class WhatsappMessage(db.Model):
  __tablename__ = "whatsapp_messages"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("consultants.id", ondelete="SET NULL"))
  message_body: Mapped[str | None] = mapped_column(Text)
  direction: Mapped[str] = mapped_column(String(16), nullable=False)
  parsed_intent: Mapped[str | None] = mapped_column(String(128))
  raw_payload: Mapped[dict | None] = mapped_column(JSON)
  status: Mapped[str] = mapped_column(String(32), default="received", nullable=False)
  error_message: Mapped[str | None] = mapped_column(Text)
  agency_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("real_estate_agencies.id", ondelete="SET NULL"))
  flow: Mapped[str | None] = mapped_column(String(64))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BotSession(db.Model):
  __tablename__ = "bot_sessions"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("consultants.id", ondelete="SET NULL"))
  phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
  current_flow: Mapped[str | None] = mapped_column(String(64))
  current_step: Mapped[str] = mapped_column(String(64), default="idle", nullable=False)
  agency_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("real_estate_agencies.id", ondelete="SET NULL"))
  session_data: Mapped[dict] = mapped_column(JSON, default=dict)
  status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
  expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: utcnow() + timedelta(hours=24))
  last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class HubspotMapping(db.Model):
  __tablename__ = "hubspot_mappings"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  agency_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("real_estate_agencies.id", ondelete="CASCADE"), unique=True)
  hubspot_company_id: Mapped[str | None] = mapped_column(String(64))
  hubspot_contact_id: Mapped[str | None] = mapped_column(String(64))
  last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

  agency: Mapped[RealEstateAgency] = relationship(back_populates="hubspot_mapping")


class SlackEvent(db.Model):
  __tablename__ = "slack_events"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  event_type: Mapped[str] = mapped_column(String(128), nullable=False)
  slack_user_id: Mapped[str | None] = mapped_column(String(64))
  slack_team_id: Mapped[str | None] = mapped_column(String(64))
  channel_id: Mapped[str | None] = mapped_column(String(64))
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
  payload: Mapped[dict] = mapped_column(JSON, default=dict)
  response: Mapped[dict | None] = mapped_column(JSON)
  status: Mapped[str] = mapped_column(String(32), default="received", nullable=False)
  error_message: Mapped[str | None] = mapped_column(Text)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SlackSession(db.Model):
  __tablename__ = "slack_sessions"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  slack_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
  current_flow: Mapped[str | None] = mapped_column(String(64))
  current_step: Mapped[str] = mapped_column(String(64), default="idle", nullable=False)
  agency_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
  session_data: Mapped[dict] = mapped_column(JSON, default=dict)
  status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
  expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: utcnow() + timedelta(hours=2))
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SlackNotification(db.Model):
  __tablename__ = "slack_notifications"

  id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
  notification_type: Mapped[str] = mapped_column(String(64), nullable=False)
  agency_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
  consultant_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
  slack_user_id: Mapped[str | None] = mapped_column(String(64))
  channel_id: Mapped[str | None] = mapped_column(String(64))
  message_ts: Mapped[str | None] = mapped_column(String(64))
  payload: Mapped[dict | None] = mapped_column(JSON)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ── Triggers ────────────────────────────────────────────────────────────────

@event.listens_for(AgencyInteraction, "after_insert")
def sync_agency_on_interaction(_mapper, _connection, target: AgencyInteraction) -> None:
  agency = db.session.get(RealEstateAgency, target.agency_id)
  if not agency:
    return
  agency.last_interaction_date = target.interaction_date or utcnow()
  agency.total_interactions = (agency.total_interactions or 0) + 1
  if target.status_after:
    agency.negotiation_status = target.status_after
  if target.next_steps is not None:
    agency.next_steps = target.next_steps
  if target.feedback is not None:
    agency.feedback = target.feedback
  if target.current_offer is not None:
    agency.current_offer = target.current_offer
  if target.contract_stock is not None:
    agency.contract_stock = target.contract_stock
  if target.c_level_support_needed is not None:
    agency.c_level_support_needed = target.c_level_support_needed
  if target.created_by:
    agency.updated_by = target.created_by
  agency.updated_at = utcnow()


TABLE_MODEL_MAP = {
  "user_roles": UserRole,
  "consultants": Consultant,
  "real_estate_agencies": RealEstateAgency,
  "agency_interactions": AgencyInteraction,
  "whatsapp_messages": WhatsappMessage,
  "bot_sessions": BotSession,
  "hubspot_mappings": HubspotMapping,
  "slack_events": SlackEvent,
  "slack_sessions": SlackSession,
  "slack_notifications": SlackNotification,
}
