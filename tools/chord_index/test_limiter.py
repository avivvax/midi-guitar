"""python3 -m unittest tools/chord_index/test_limiter.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from resolve_names import Limiter  # noqa: E402


class LimiterTest(unittest.TestCase):
    def test_sporadic_server_errors_do_not_slow_down(self):
        lim = Limiter(6)
        for i in range(1000):
            lim.soft_error() if i % 100 == 0 else lim.success()
        self.assertEqual(lim.rate, 6)

    def test_frequent_errors_slow_down_and_recover(self):
        lim = Limiter(6)
        for _ in range(60):
            lim.soft_error()
        self.assertLess(lim.rate, 6)
        for _ in range(2000):
            lim.success()
        self.assertEqual(lim.rate, 6)

    def test_429_halves_and_pauses(self):
        lim = Limiter(6)
        lim.throttled(0.01)
        self.assertEqual(lim.rate, 3)
        self.assertGreater(lim.pause_until, 0)
        for _ in range(400):
            lim.success()
        self.assertEqual(lim.rate, 6)


if __name__ == "__main__":
    unittest.main()
