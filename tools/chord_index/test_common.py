"""python3 -m unittest tools/chord_index/test_common.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean_title, convert_chord, estimate_key, index_words, normalize, parse_progression, prefix_file  # noqa: E402


class T(unittest.TestCase):
    def test_convert(self):
        cases = {"C": "C", "Amin": "Am", "Fsmin7": "F#m7", "D/Fs": "D/F#", "Csus4": "Csus4", "Cssus4": "C#sus4",
                 "Bbmaj7": "Bbmaj7", "Eno3d": "E5", "Fadd13": "F6", "Amin/G": "Am/G", "Gsdim7": "G#dim7",
                 "Dsus2": "Dsus2", "Asmin": "A#m", "Cminmaj7": "Cm(maj7)"}
        for src, want in cases.items():
            self.assertEqual(convert_chord(src), want, src)
        self.assertIsNone(convert_chord("sC"))

    def test_sections(self):
        self.assertEqual(
            parse_progression("<intro_1> C <verse_1> F C <verse_2> G <chorus_1> Amin"),
            [("Intro", ["C"]), ("Verse", ["F", "C"]), ("Verse 2", ["G"]), ("Chorus", ["Am"])],
        )
        self.assertEqual(parse_progression("C G Amin F"), [("Song", ["C", "G", "Am", "F"])])

    def test_normalize(self):
        # Shared vectors with src/song/chordIndex.test.ts
        self.assertEqual(normalize("Knockin' On Heaven's Door"), "knockin on heavens door")
        self.assertEqual(normalize("Beyoncé – Halo (Live)"), "beyonce halo live")
        self.assertEqual(normalize("הַתִּקְוָה"), "התקוה")
        self.assertEqual(index_words("The Sound of Silence"), ["sound", "silence"])
        self.assertEqual(prefix_file("ab"), "6162")
        self.assertEqual(prefix_file("הת"), "d794d7aa")

    def test_clean_title(self):
        cases = {
            "Let It Be - Remastered 2009": "Let It Be",
            "The Wall - Live at Folsom State Prison, Folsom, CA - January 1968": "The Wall",
            "Hallelujah": "Hallelujah",
            "Stand by Me (Remastered)": "Stand by Me",
            "Hey Jude - 2015 Mix": "Hey Jude",
            "Mr. Brightside": "Mr. Brightside",
            "Love Me Do - Mono / Remastered": "Love Me Do",
            "Bohemian Rhapsody - Remastered 2011": "Bohemian Rhapsody",
            "Part One - The Beginning": "Part One - The Beginning",
        }
        for src, want in cases.items():
            self.assertEqual(clean_title(src), want, src)

    def test_key(self):
        self.assertEqual(estimate_key("G D Am C G D Am C".split()), "G")
        self.assertEqual(estimate_key("Am Dm E Am Dm E Am".split()), "Am")
        self.assertEqual(estimate_key("C F G C Am F G C".split()), "C")


if __name__ == "__main__":
    unittest.main()
