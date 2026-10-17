# FiberOps — Reference-aligned visual assets and layout notes

These assets are reconstructed to follow the approved `image(9).png` visual direction. The cropped PNG is taken from the approved mockup reference; it is not an official Lintasarta brand master. Use an official vector/hi-res brand asset for production if available.

## Install
Copy these files to `apps/web/public/assets/`:
- `fiberops-header-gradient.svg`
- `fiberops-sidebar-gradient.svg`
- `lintasarta-logo.png`

## CSS reference
Rename selectors to match the existing app components. Consolidate old background declarations rather than stacking overrides.

```css
.app-header {
  background: #cde7fb url("/assets/fiberops-header-gradient.svg") center / 100% 100% no-repeat;
}

.app-sidebar {
  background: #d7ecfc url("/assets/fiberops-sidebar-gradient.svg") center / 100% 100% no-repeat;
}

.app-brand-logo {
  display: block;
  width: 144px;
  height: auto;
  object-fit: contain;
}
```

## Layout details from the reference
- Keep the desktop sidebar near 244px wide; do not let it shrink.
- Render the logo at roughly 140–145px wide. The incorrect screenshot shows it much smaller than the reference.
- The reference top search field begins approximately 186px inside the content header (around x=430 at a 1536px-wide viewport), and is about 490px wide. Use explicit grid columns instead of letting `justify-content: space-between` place it unpredictably.
- Use `grid-template-columns: 186px minmax(360px, 490px) minmax(0, 1fr)` for the content portion of the desktop topbar as an initial anchor, with responsive adjustments below desktop widths.
- Remove unintended `max-width` constraints on the primary dashboard content if they create large side gutters on wide screens. Keep the content grid full-width with approximately 18px inner gutters at 1536px, then verify 1920px layout separately.
- Restore the `Buat Tiket` action beside `Export laporan`, retaining its existing click handler and role permissions.

## Verification checklist
1. Compare at a 1536 × 1024 browser viewport and 100% zoom first, matching the reference image size.
2. Verify the logo uses the exact provided PNG at the intended size.
3. Verify the header has broad translucent sky-blue curves, not a flat blue fill or a faint unrelated stripe pattern.
4. Verify the gradient fills the entire sidebar, including account/status areas at the bottom.
5. Verify the search field position relative to the sidebar, not relative to a centered max-width wrapper.
6. Verify the `Buat Tiket` button appears beside `Export laporan` and remains functional.
7. Then test 1920 × 1200 and smaller breakpoints. Do not distort or stretch the main layout to fake a screenshot match.

Do not claim the result is verified unless the running browser was actually inspected.
