# AXO AI Visibility Scanner v2.4

Fixes Supabase RLS persistence.

The previous backend did:
`insert(...).select('id').single()`

That required a SELECT policy after the INSERT. Public/anon access intentionally has no SELECT permission, so Supabase rejected the request.

v2.4 now performs INSERT only:
- public key can save the lead
- public key still cannot read the table
- no need to expose SELECT access

Verify deployment:
`/api/version` -> `2.4-supabase-insert-only`

If your existing `scanner_insert_only` policy is already present, no SQL change should be necessary. `supabase_patch_v2_4.sql` is included as a safe reset of the insert-only policy.
