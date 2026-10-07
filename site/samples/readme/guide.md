---
title: Guide
order: 2
---

# Guide

## Installation

Orbit Lab needs Python 3.12 or later.

```bash
pip install orbit-lab
```

## First simulation

A scenario is a YAML file that names the body and the starting orbit.

```yaml
body: earth
orbit:
  altitude_km: 400
  inclination_deg: 51.6
duration_min: 90
```

```bash
orbit-lab run scenario.yml --plot ground-track.svg
```

> [!TIP]
> Start from an altitude of 400 km, the orbit of the International Space Station, and compare the
> result with the period in [Orbital mechanics](math.md).
