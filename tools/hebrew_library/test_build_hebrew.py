"""python3 -m unittest tools/hebrew_library/test_build_hebrew.py"""
import collections
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_hebrew import clean_text, convert_chord, label_sections, split_merged  # noqa: E402


class T(unittest.TestCase):
    def conv(self, tok):
        return convert_chord(tok, collections.Counter(), collections.Counter())

    def test_israeli_notation(self):
        cases = {"G4": "Gsus4", "D2": "Dsus2", "G47": "G7sus4", "D74": "D7sus4", "D94": "D9sus4",
                 "C7+": "C7#5", "D5+": "D+", "CM7": "Cmaj7", "B°": "Bdim", "E79": "E9", "F#sus7": "F#7sus4",
                 "Ddim6": "Ddim7", "Gm2": "Gmadd9", "Am": "Am", "F#7sus4": "F#7sus4", "Bb/D": "Bb/D",
                 "Em79+/B": "Em9/B", "Am6+": "Am6", "C#dim": "C#dim"}
        for src, want in cases.items():
            self.assertEqual(self.conv(src), want, src)

    def test_unparsed_counted(self):
        unparsed = collections.Counter()
        self.assertIsNone(convert_chord("Hm", collections.Counter(), unparsed))
        self.assertEqual(unparsed["Hm"], 1)

    def test_text_cleanup(self):
        self.assertEqual(clean_text("אריק איינשטיין  ,שלום חנוך"), "אריק איינשטיין, שלום חנוך")
        self.assertEqual(clean_text("...יזהר אשדות"), "יזהר אשדות")
        self.assertEqual(clean_text("  שיר  ללא שם "), "שיר ללא שם")
        self.assertEqual(split_merged("", "Let love inכנסיית השכל"), ("Let love in", "כנסיית השכל"))
        self.assertEqual(split_merged("אבא", "שלומי שבת"), ("אבא", "שלומי שבת"))

    def test_section_labels(self):
        self.assertEqual(label_sections(["A"]), ["שיר"])
        self.assertEqual(label_sections(["V1", "C", "V2", "C"]), ["בית 1", "פזמון", "בית 2", "פזמון"])
        # Identical verses keep the same name.
        self.assertEqual(label_sections(["V", "V2", "C", "V", "C"]), ["בית 1", "בית 2", "פזמון", "בית 1", "פזמון"])
        # No repeats: all verses.
        self.assertEqual(label_sections(["A", "B", "C"]), ["בית 1", "בית 2", "בית 3"])
        # Tie in repetitions: the later-appearing block is the chorus.
        self.assertEqual(label_sections(["V", "C", "V", "C"]), ["בית 1", "פזמון", "בית 1", "פזמון"])


if __name__ == "__main__":
    unittest.main()
