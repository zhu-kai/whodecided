---
description: Typecheck (build) and run the test suite; report the result in one line
---

Run `npm run build` (tsc) then `npm test`.

- If both pass, say so in one line with the test count.
- If either fails, show the exact failing output and stop - do not "fix" by loosening a test or a type.
