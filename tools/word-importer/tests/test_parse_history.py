import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
from parse_history import parse_history  # noqa: E402


class ParseHistoryTests(unittest.TestCase):
    def test_splits_sessions_and_preserves_raw_lines(self):
        from import_docx import WORD_NS

        texts = ["1.06.2026", "Жим 3 по 10", "8.06.2026", "Сведение 4 по 12"]
        paragraphs = "".join(f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" for text in texts)
        document = f'<w:document xmlns:w="{WORD_NS}"><w:body>{paragraphs}</w:body></w:document>'
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "monday.docx"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("word/document.xml", document)
            parsed = parse_history(source, "chest")
        self.assertEqual(parsed["session_count"], 2)
        self.assertEqual(parsed["sessions"][0]["date"], "2026-06-01")
        self.assertEqual(parsed["sessions"][1]["raw_exercises"][0]["text"], "Сведение 4 по 12")
        self.assertEqual(parsed["warnings"], [])

    def test_rejects_unknown_focus(self):
        with self.assertRaisesRegex(ValueError, "Неизвестная группа"):
            parse_history(Path("anything.docx"), "arms")


if __name__ == "__main__":
    unittest.main()
