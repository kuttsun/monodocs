---
title: 数式
order: 8
---

# 数式

`$...$` で文中に、`$$...$$` または `math` のコードブロックで別行に数式を書けます。
数式はビルド時に MathML へ変換されるため、出力にスクリプトは要りません。

各項目は **ソース** を先に示し、その下に **表示（HTML 変換結果）** を並べます。

> [!NOTE]
> 数式はブラウザが OpenType MATH フォントで描きます。Windows なら Cambria Math、Debian / Ubuntu
> なら Latin Modern Math（`fonts-lmodern`）です。無いと括弧や根号が伸びません。

## 文中の数式

**ソース:**

```markdown
質量とエネルギーは $E = mc^2$ の関係にあり、ギリシャ文字 $\alpha + \beta = \gamma$ も文中に置けます。
```

**表示:**

質量とエネルギーは $E = mc^2$ の関係にあり、ギリシャ文字 $\alpha + \beta = \gamma$ も文中に置けます。

## 別行立ての数式

**ソース:**

````markdown
$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

```math
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
```
````

**表示:**

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

```math
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
```

## 行列と揃えた式

**ソース:**

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

**表示:**

```math
A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}, \quad \det A = ad - bc
```

```math
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
```
