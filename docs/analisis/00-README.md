# Análisis del proyecto — Sistema Larvicultura (Vite)

> Análisis previo a la "versión definitiva". **No se ha copiado ni modificado código.**
> Fuente analizada: `C:\Users\Usuario\Downloads\CLAUDE CODE\Nuevo proyecto`
> Fecha: 2026-06-12

Este documento aplica cuatro skills de `mattpocock/skills` como **metodología de análisis**,
con la salida en archivos markdown locales (no se crearon issues en GitHub).

## Resumen ejecutivo

El proyecto es una migración modular **de muy buena calidad** del monolito `sistema F.html`
a un proyecto **Vite + ES modules**. La capa `src/core` (datos, sin DOM) y la separación por
vistas están bien diseñadas: estado central por `store` + bus de eventos, navegación por
delegación, `esc()` usado de forma consistente (184 usos), sin `console.log` ni globales
colgadas de `window`.

**Los problemas no están en lo que ya se migró bien, sino en tres frentes:**

1. **Cero cobertura de tests.** No hay script `test` ni archivos de prueba. La lógica analítica
   crítica (fechas, semáforos, supervivencia, clasificación de hojas) no tiene red de seguridad.
2. **El monolito `public/registros/engine.js` (13.149 líneas)** quedó embebido tal cual, con
   `onclick=` inline y arranque automático contra el DOM. Es lo opuesto al refactor limpio de
   `src/` y concentra casi todo el riesgo del proyecto.
3. **No hay documento de estándares** (`CLAUDE.md` / `CONTRIBUTING.md` / `STANDARDS.md`). La skill
   `review` necesita estándares documentados para su eje "Standards"; aquí hubo que inferirlos.

## Entregables

| # | Archivo | Skill aplicada | Qué contiene |
|---|---------|----------------|--------------|
| 1 | [`01-review.md`](01-review.md) | `review` | Revisión de dos ejes: **Estándares** (convenciones inferidas) y **Spec** (¿el código cumple lo que el README promete?). |
| 2 | [`02-diagnose.md`](02-diagnose.md) | `diagnose` | Defectos candidatos hallados por análisis estático, con hipótesis falsables y cómo construir el bucle de feedback que la skill exige. |
| 3 | [`03-qa-issues.md`](03-qa-issues.md) | `qa` | Issues de QA redactados con la plantilla de la skill (orientados a comportamiento, sin rutas de archivo), listos para `gh issue create` o seguimiento manual. |
| 4 | [`04-refactor-plan.md`](04-refactor-plan.md) | `request-refactor-plan` | Plan de refactor del monolito `engine.js` en commits diminutos, con documento de decisiones y plan de testing. |

## Limitaciones del análisis

- **`diagnose`** está pensada para **un bug concreto reproducible**. Sin un bug reportado, el
  entregable es un *barrido* de defectos candidatos; cada uno necesitaría que tú confirmes el
  síntoma antes de aplicar el bucle completo de la skill.
- **`qa`** normalmente la conduces tú reportando fallos. Aquí los issues se infirieron del código
  y de la UX; márcalos/edítalos según lo que observes en uso real.
- **`review`** asume un `git diff` contra un punto fijo. Como el proyecto no es repo git, se revisó
  el árbol `src/` completo como si fuera el cambio.
