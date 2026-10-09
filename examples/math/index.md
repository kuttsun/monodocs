---
title: 数式（Markdown）
order: 1
---

# 数式（Markdown）

v0.14 が実測した数式と、v0.16 で足したアクセントです（[roadmap.md](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) 6.4）。
文中の数式が 8 つ、別行立ての数式が 15 あります。
同じ数式を AsciiDoc で書いたものが [数式（AsciiDoc）](asciidoc.adoc) にあります。

```bash
monodocs build examples/math --format both -o dist/math   # dist/math/docs.html と docs.pdf
```

数式は、ビルドするマシンと読者のブラウザにある OpenType MATH フォントで描かれます。
次のことを確かめます。

- 変数とギリシャ文字が豆腐（□）にならない
- `\mathbb` と `\mathbf` の文字（式 9 の太字の E、B と、下の段落の二重線の R、N）が、ふつうの変数と見分けられる
- 伸びる括弧（式 5、6、8、11）と根号（式 1、3）が中身に合わせて伸びる
- アクセント（下の段落）が文字の上に来る。`aligned`（式 7）の `=` の前の隙間を見る
- 幅の広いアクセント（式 15）が中身の上（`\utilde` と `\underbrace` は下）に来る。`\overrightarrow` と括弧は中身の幅に伸び、`\widehat` などは Latin Modern Math では 1 文字ほどにとどまる（roadmap 6.4）

MATH フォントの無いマシンで PDF を作ると、フォント検査が数式の文字（`font/missing`）と MATH テーブルの不在（`font/no-math-table`）を報告します。

## 文中の数式

質量とエネルギーは $E = mc^2$ の関係にある。
ギリシャ文字 $\alpha + \beta = \gamma$、添字 $x_{i,j}^{2}$、累乗根 $\sqrt[3]{x}$、分数 $\frac{a}{b}$、アクセント $\hat{\theta},\ \bar{x},\ \vec{v},\ \dot{x}$、集合 $\forall x \in \mathbb{R},\ \exists n \in \mathbb{N}$ を文中に含む段落。
鋭アクセントと重アクセント $\acute{e},\ \grave{a}$ も文中に含む。

## 式 1

```math
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
```

## 式 2

```math
e^{i\pi} + 1 = 0
```

## 式 3

```math
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
```

## 式 4

```math
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
```

## 式 5

```math
A = \begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{m1} & a_{m2} & \cdots & a_{mn} \end{pmatrix}
```

## 式 6

```math
f(x) = \begin{cases} x^2 & (x \ge 0) \\ -x & (x < 0) \end{cases}
```

## 式 7

```math
\begin{aligned} (a+b)^2 &= (a+b)(a+b) \\ &= a^2 + 2ab + b^2 \end{aligned}
```

## 式 8

```math
\lim_{n \to \infty} \left( 1 + \frac{1}{n} \right)^n = e
```

## 式 9

```math
\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}
```

## 式 10

```math
P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}
```

## 式 11

```math
\left[ \frac{1}{1 + \frac{1}{1 + \frac{1}{x}}} \right]
```

## 式 12

```math
\operatorname{softmax}(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}
```

## 式 13

```math
\text{速度}\ v = \frac{\Delta x}{\Delta t} \quad [\mathrm{m/s}]
```

## 式 14

```math
e^x = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \frac{x^4}{4!} + \frac{x^5}{5!} + \frac{x^6}{6!} + \frac{x^7}{7!} + \frac{x^8}{8!} + \frac{x^9}{9!} + \frac{x^{10}}{10!} + \cdots
```

## 式 15

```math
\widehat{xyz},\ \widetilde{xyz},\ \widecheck{xyz},\ \utilde{xyz},\ \overrightarrow{ABC},\ \overbrace{a+b+c}^{n},\ \underbrace{a+b+c}_{n}
```
