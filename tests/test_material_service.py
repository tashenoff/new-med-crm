import sys
from pathlib import Path

import pytest

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from backend.services.material_service import MaterialService
from backend.models.material import MaterialCreate, MaterialUpdate


class FakeUpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count


class FakeCollection:
    def __init__(self):
        self.docs = []

    def _matches(self, doc: dict, filters: dict) -> bool:
        for key, value in filters.items():
            if isinstance(value, dict) and "$regex" in value:
                import re
                flags = 0
                if value.get("$options") and "i" in value["$options"]:
                    flags |= re.IGNORECASE
                pattern = re.compile(value["$regex"], flags)
                if not pattern.search(doc.get(key, "")):
                    return False
            else:
                if doc.get(key) != value:
                    return False
        return True

    def find(self, filters):
        matches = [doc for doc in self.docs if self._matches(doc, filters)]

        class FakeCursor:
            def __init__(self, records):
                self.records = records

            def sort(self, *args, **kwargs):
                return self

            async def to_list(self, _):
                return self.records

        return FakeCursor(matches)

    async def find_one(self, filters):
        for doc in self.docs:
            if self._matches(doc, filters):
                return doc
        return None

    async def insert_one(self, doc):
        self.docs.append(doc)
        return type("Result", (), {"inserted_id": doc["id"]})

    async def update_one(self, filters, update):
        for doc in self.docs:
            if self._matches(doc, filters):
                if "$set" in update:
                    doc.update(update["$set"])
                return FakeUpdateResult(1)
        return FakeUpdateResult(0)


class FakeDB:
    def __init__(self):
        self.materials = FakeCollection()


@pytest.fixture
def material_service():
    return MaterialService(FakeDB())


@pytest.mark.asyncio
async def test_create_material_and_search(material_service):
    created = await material_service.create_material(MaterialCreate(name="Аналгин", unit="амп"))
    assert created.name == "Аналгин"
    results = await material_service.get_materials(search="анал")
    assert len(results) == 1


@pytest.mark.asyncio
async def test_create_duplicate_material_raises(material_service):
    await material_service.create_material(MaterialCreate(name="Стерильный бинт"))
    with pytest.raises(HTTPException) as exc:
        await material_service.create_material(MaterialCreate(name="стерильный бинт"))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_update_without_fields_errors(material_service):
    created = await material_service.create_material(MaterialCreate(name="Шприцы"))
    with pytest.raises(HTTPException) as exc:
        await material_service.update_material(created.id, MaterialUpdate())
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_material_softens(material_service):
    created = await material_service.create_material(MaterialCreate(name="Дезраствор"))
    response = await material_service.delete_material(created.id)
    assert response["message"] == "Материал удалён"
    remaining = await material_service.get_materials()
    assert remaining == []
