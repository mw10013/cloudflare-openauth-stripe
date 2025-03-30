# SaaS for SMBs Requirements

## User Authentication

- System supports both authenticated users and unauthenticated guests
- Guests can access public-facing content only
- Users must authenticate to access non-public features
- Each user has a unique email address

## User Types

- Users are either `customer` or `staffer` (mutually exclusive)
- Type is immutable after user creation
- Type determines application access:
  - Customers -> /app/\*
  - Staffers -> /admin/\*

## Customer Accounts

- Each customer owns exactly one account
- Accounts can have multiple members
- Members must be customers (staffers cannot be members)
- Account ownership is permanent and cannot be transferred
- Resources can be transferred between accounts as needed

## Account Subscriptions

- Each account may have one Stripe customer
- Each account may have one Stripe subscription
- Account owner's email must match Stripe customer email
- When user email changes, Stripe customer email must be updated to maintain synchronization

## Member Management

- Account owners can invite customers by email
  - The email must not be a staffer email.
  - A user, account, and account member are upserted for the email.
  - An invite email is sent to the email.
- An account member has a status
  - pending - Awaiting acceptance
  - rejected - Rejected
  - active - Current member
  - revoked - Owner revoked access
  - left - customer left the account
  - deleted - Soft-deleted by owner
- Status transitions:
  - Initial state → pending
  - pending → active (when member accepts)
  - pending → rejected (when member declines)
  - active → revoked (when owner revokes access)
  - active → left (when member leaves)
  - Any status → deleted (when owner deletes)

## Staffers Access

- Staffers operate the administrative application
- Staffers cannot be account members
- Staffers cannot access /app/\*

## Deferred Requirements

- [ ] Soft delete implementation
- [ ] Permission levels structure
- [ ] Role hierarchy (if needed beyond capabilities)
- [ ] Member invitation expiration
- [ ] Member removal process
- [ ] Multi-account resource transfer UI
- [ ] Audit logs for membership status changes

## Reference

- https://developers.cloudflare.com/fundamentals/setup/manage-members/policies/
- https://developers.cloudflare.com/fundamentals/setup/manage-members/roles/
- https://developers.cloudflare.com/fundamentals/setup/manage-members/scope/
