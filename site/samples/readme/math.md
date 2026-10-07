---
title: Orbital mechanics
order: 3
---

# Orbital mechanics

## Circular orbits

A satellite of mass $m$ in a circular orbit of radius $r$ is held by gravity, so the gravitational
force equals the centripetal force:

$$
\frac{G M m}{r^2} = \frac{m v^2}{r}
\quad\Longrightarrow\quad
v = \sqrt{\frac{G M}{r}}
$$

The period $T$ follows from $v = 2\pi r / T$:

$$
T = 2\pi \sqrt{\frac{r^3}{G M}}
$$

At an altitude of 400 km, $r \approx 6.78 \times 10^{6}$ m and $T \approx 93$ minutes.

## Equations of motion

The simulator integrates the two-body problem, where $\mu = G M$ and $r$ is the length of $\mathbf{r}$:

```math
\ddot{\mathbf{r}} = -\frac{\mu}{r^{3}}\,\mathbf{r},
\qquad
\mathbf{r}(t) = \begin{pmatrix} x(t) \\ y(t) \\ z(t) \end{pmatrix}
```

## Orbital energy

The specific orbital energy $\varepsilon$ is constant along an orbit with semi-major axis $a$:

```math
\varepsilon = \frac{v^2}{2} - \frac{\mu}{r} = -\frac{\mu}{2a}
```

| Quantity | Symbol | Value for Earth |
| -------- | ------ | --------------- |
| Gravitational parameter | $\mu$ | $3.986 \times 10^{14}$ m³/s² |
| Equatorial radius | $R_\oplus$ | 6378 km |
