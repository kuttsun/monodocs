---
title: Math
order: 8
---

# Math

`$...$` writes a formula inside a sentence, and `$$...$$` or a fenced `math` block writes one on its
own line. Formulas are rendered to MathML at build time, so the output needs no script.

Each item shows the **source** first, then the **rendered output (HTML)** below it.

> [!NOTE]
> The browser draws formulas with an OpenType MATH font: Cambria Math on Windows, or Latin Modern
> Math (`fonts-lmodern`) on Debian and Ubuntu. Without one, brackets and radicals do not stretch.

## Inline

**Source:**

```markdown
Mass and energy are related by $E = mc^2$, and $\alpha + \beta = \gamma$ sits in the sentence too.
```

**Rendered:**

Mass and energy are related by $E = mc^2$, and $\alpha + \beta = \gamma$ sits in the sentence too.

## Display

**Source:**

````markdown
$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

```math
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
```
````

**Rendered:**

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

```math
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
```

## Matrices and aligned equations

**Source:**

````markdown
```math
A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}, \quad \det A = ad - bc
```

```math
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
```
````

**Rendered:**

```math
A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}, \quad \det A = ad - bc
```

```math
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
```
