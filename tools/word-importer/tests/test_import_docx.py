import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "import_docx.py"
SPEC = importlib.util.spec_from_file_location("import_docx", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ImportDocxTests(unittest.TestCase):
    def test_extracts_paragraphs_and_tables(self):
        document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="{MODULE.WORD_NS}"><w:body>
          <w:p><w:r><w:t>Понедельник — грудь</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>Упражнение</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Подходы</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>Жим</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3×10</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
        </w:body></w:document>'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "тренировки.docx"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("word/document.xml", document)
            draft = MODULE.extract_docx(source)

        self.assertEqual(draft["status"], "needs_review")
        self.assertEqual(draft["blocks"][0]["text"], "Понедельник — грудь")
        self.assertEqual(draft["blocks"][1]["rows"][1], ["Жим", "3×10"])
        self.assertEqual(len(draft["source"]["sha256"]), 64)

    def test_rejects_non_docx(self):
        with self.assertRaisesRegex(ValueError, "только файлы .docx"):
            MODULE.extract_docx(Path("training.pdf"))


if __name__ == "__main__":
    unittest.main()
