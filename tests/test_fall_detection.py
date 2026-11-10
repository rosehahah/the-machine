import unittest
from types import SimpleNamespace

from backend.threat import Threat, assess


class FallDetectionTest(unittest.TestCase):
    def test_trajectories(self):
        standing = (500, (575, 485, 625, 625))
        walking = (630, (575, 580, 625, 720))
        clipped_walk = (630, (560, 645, 640, 720))
        collapse = (650, (500, 610, 700, 690))
        clipped = (660, (500, 640, 700, 720))
        crouch = (650, (570, 620, 630, 710))
        cases = [
            ("upright exit", [(0.9, walking)], []),
            ("clipped upright exit", [(0.9, clipped_walk)], []),
            ("brief crouch", [(0.6, crouch), (1.0, standing)], []),
            ("brief occlusion", [(0.5, None), (0.9, standing)], []),
            ("visible fall then exit", [(0.6, collapse), (1.7, collapse)], [("down", False)]),
            ("uncut fall then loss", [(0.6, collapse)], [("down", True)]),
            ("fall then clipped", [(0.6, collapse), (0.8, clipped)], [("down", True)]),
            ("recovery clears evidence", [(0.6, collapse), (0.8, standing), (1.0, clipped_walk)], []),
            ("stale evidence expires", [(0.6, (635, collapse[1])), (1.2, clipped_walk), (1.9, clipped_walk)], []),
        ]
        for name, frames, expected in cases:
            with self.subTest(name=name):
                track = SimpleNamespace(tid=1, pid=None, threat=Threat())
                events = []

                def step(time, observation):
                    alive = set()
                    if observation is not None:
                        cy, track.body = observation
                        track.head = (585, cy - 15, 615, cy + 15)
                        track.last_seen = time
                        alive.add(1)
                    incidents = assess({1: track}, alive, [], 1280, 720, time, lambda _: None)
                    events.extend((item["kind"], item.get("offscreen", False)) for item in incidents)

                step(10.0, standing)
                for time, observation in frames:
                    step(10.0 + time, observation)
                count_before_loss = len(events)
                step(track.last_seen + 0.99, None)
                self.assertEqual(len(events), count_before_loss)
                step(track.last_seen + 1.01, None)
                step(track.last_seen + 1.5, None)
                self.assertEqual(events, expected)
