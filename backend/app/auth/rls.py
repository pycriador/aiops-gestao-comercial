"""Row-level security policies for portfolio data."""

from sqlalchemy import select

from app.auth.permissions import data_scope_for_user, has_permission
from app.extensions import db
from app.models import Consultant, RealEstateAgency, UserRole


def user_roles(user_id: str | None) -> set[str]:
  if not user_id:
    return set()
  rows = db.session.scalars(select(UserRole.role).where(UserRole.user_id == user_id)).all()
  return set(rows)


def has_role(user_id: str | None, role: str) -> bool:
  return role in user_roles(user_id)


def is_privileged(user_id: str | None) -> bool:
  return data_scope_for_user(user_id) == "all"


def consultant_id_for_user(user_id: str | None) -> str | None:
  if not user_id:
    return None
  return db.session.scalar(
    select(Consultant.id).where(Consultant.user_id == user_id, Consultant.active.is_(True))
  )


def can_read_agency(user_id: str | None, agency: RealEstateAgency, service_role: bool = False) -> bool:
  if service_role:
    return True
  if not has_permission(user_id, "portfolio.read"):
    return False
  if is_privileged(user_id):
    return True
  cid = consultant_id_for_user(user_id)
  return cid is not None and agency.consultant_id == cid


def agency_read_filter(user_id: str | None, service_role: bool = False):
  q = select(RealEstateAgency)
  if service_role or is_privileged(user_id):
    return q
  cid = consultant_id_for_user(user_id)
  if not cid:
    return q.where(False)
  return q.where(RealEstateAgency.consultant_id == cid)


def can_write_agency(user_id: str | None, agency: RealEstateAgency | None, service_role: bool = False) -> bool:
  if service_role:
    return True
  if not has_permission(user_id, "portfolio.write"):
    return False
  if is_privileged(user_id):
    return True
  if agency is None:
    return consultant_id_for_user(user_id) is not None
  cid = consultant_id_for_user(user_id)
  return cid is not None and agency.consultant_id == cid


def can_delete_agency(user_id: str | None, service_role: bool = False) -> bool:
  return service_role or has_permission(user_id, "portfolio.delete")


def can_manage_consultants(user_id: str | None, service_role: bool = False) -> bool:
  return service_role or has_permission(user_id, "consultants.manage")


def can_read_consultants(user_id: str | None, service_role: bool = False) -> bool:
  return service_role or has_permission(user_id, "consultants.read") or has_permission(user_id, "consultants.manage")
