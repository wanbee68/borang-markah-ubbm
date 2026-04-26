# Security Specification - UBBM System

## Data Invariants
1. An assessment record (`ubbm_records`) must have exactly the fields defined in the blueprint and be linked to the creating user.
2. Candidate scores in an assessment must be between 0 and 10 (Analitik) or 0 and 30 (Holistik).
3. Student master records must be protected from unauthorized changes (currently open for preview, but should be restricted in a real scenario).

## The "Dirty Dozen" Payloads (Red Team Test)
1. **Malicious ID Injection**: Attempt to create a record with a 500-character document ID.
2. **Shadow Field Attack**: Add `isAdmin: true` to a student record.
3. **Score Inflation**: Set `analitik.idea: 99` (Limit is 10).
4. **Holistik Inflation**: Set `holistik: 100` (Limit is 30).
5. **Identity Spoofing**: Create a record with `userId: "NOT_ME"`.
6. **Future Date Injection**: Set `createdAt` to a point in the future.
7. **Type Mismatch**: Send `candidates: "none"` (expected array).
8. **Negative Scores**: Set `sebutan: -5`.
9. **Large String Attack**: Set candidate name to a 2MB string.
10. **State Corruption**: Update a record with an invalid `noPusat`.
11. **PII Scraping**: Attempt to list all records without being an owner/authorized.
12. **Null Value Poisoning**: Set `header: null`.

## Test Runner Logic
The `firestore.rules` should implement helpers `isValidUBBMRecord` and `isValidStudent`.
