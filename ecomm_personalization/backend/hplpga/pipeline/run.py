"""Pipeline orchestrator.

    python -m hplpga.pipeline.run                # full pipeline
    python -m hplpga.pipeline.run --stages models evaluate
"""
from __future__ import annotations

import argparse
import logging
import time

STAGES = ["ingest", "catalog", "storefront", "banners", "segments", "models", "evaluate", "select"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stages", nargs="*", default=STAGES, choices=STAGES)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    t0 = time.time()
    for st in STAGES:
        if st not in args.stages:
            continue
        t = time.time()
        logging.info("=== stage: %s", st)
        if st == "ingest":
            from . import ingest; ingest.run()
        elif st == "catalog":
            from . import catalog; catalog.run()
        elif st == "storefront":
            from . import storefront; storefront.run()
        elif st == "banners":
            from . import banners; banners.run()
        elif st == "segments":
            from . import segments; segments.run()
        elif st == "models":
            from . import train; train.run()
        elif st == "evaluate":
            from . import evaluate; evaluate.run()
        elif st == "select":
            from . import select_model; select_model.run()
        logging.info("=== %s finished in %.1fs", st, time.time() - t)
    logging.info("pipeline finished in %.1fs", time.time() - t0)


if __name__ == "__main__":
    main()
