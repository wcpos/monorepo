# Behaviour ledger: `components/bar-controls`

**Job:** What every bar draws besides its title and actions: the drawer's menu below `lg`, the online status, the bell and the cashier entry.

**Composes:** `components/cashier-entry`, `components/notification-bell`, `@wcpos/hooks/use-online-status`.

## Lines

1. `useBarMenu` opens the drawer below `lg` and is `undefined` on `lg`, where the rail is always on screen; `PageBar`'s `onMenu` (through `ManagementBar`) and `RegisterBar`'s menu button both read it — evidence: test "on %s the bar has the menu and the avatar" — platform: all.
2. The online status has one form, `useOnlineBadge`: a `StatusBadge` (CODING_STANDARDS § Design, Chips, badges and switches: a named state) in the warning tone for Offline and Site unreachable, nothing while the store answers. The page bar drew Offline red until card 13 (2026-10-28); red on a till means a loss (§ 7). `RegisterBar` ranks the same reading inside its register pill (Offline, Offline · N to send) — evidence: test "reads %s as %j" — platform: all.
3. `BarControls` is the trailing pair: the bell (`<testID>-bell`), then the cashier entry (`<testID>-avatar`) below `lg` only; one `portalHost` serves both (the POS host in the register bar, the root elsewhere) — evidence: tests in `index.test.tsx` — platform: all.
