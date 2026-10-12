import uuid
from unittest.mock import AsyncMock

from models.staff import StaffMemberCreate, StaffMemberUpdate
from services.staff_service import StaffService


async def test_extension_create_update_resolve(clean_db):
    service = StaffService(clean_db)
    member = await service.create_staff_member(StaffMemberCreate(
        login=f"calliq-{uuid.uuid4()}", password="test-password", full_name="Operator Name",
        role="administrator", extension=" 100 "))
    try:
        assert member.extension == "100"
        assert (await clean_db.staff.find_one({"_id": member.id}))["extension"] == "100"
        for value in ("100", 100, " 100 "):
            assert await service.resolve_operator_by_extension(value) == "Operator Name"
        assert await service.resolve_operator_by_extension("999") is None
        assert await service.resolve_operator_by_extension(None) is None
        updated = await service.update_staff_member(member.id, StaffMemberUpdate(extension=" 101 "))
        assert updated.extension == "101"
        assert await service.resolve_operator_by_extension("100") is None
        assert await service.resolve_operator_by_extension(101) == "Operator Name"
        cleared = await service.update_staff_member(member.id, StaffMemberUpdate(extension=None))
        assert cleared.extension is None
    finally:
        await clean_db.staff.delete_one({"_id": member.id})
        await clean_db.users.delete_one({"_id": member.id})


async def test_resolver_swallows_database_errors():
    from unittest.mock import MagicMock
    db = MagicMock()
    db.staff.find_one = AsyncMock(side_effect=RuntimeError("offline"))
    assert await StaffService(db).resolve_operator_by_extension("100") is None
