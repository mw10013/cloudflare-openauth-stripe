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
  - Customers -> Customer application
  - Staffers -> Administrative application

## Customer Accounts

- Each customer owns exactly one account
- Accounts can have multiple members
- Members must be customers (staff cannot be members)

## Account Subscriptions

- Each account may have one Stripe customer
- Each account may have one Stripe subscription
- Account owner's email must match Stripe customer email

## Member Management

- Account owners can invite customers by email
- Invitees become account members upon acceptance
- Members are assigned exactly one role

## Roles

- Each role specifies a set of capabilities

## Staffers Access

- Staffers operate the administrative application
- Staffers cannot be account members
- Staffers cannot access customer application

## Deferred Requirements

- [ ] Soft delete implementation
- [ ] Permission levels structure
- [ ] Role hierarchy (if needed beyond capabilities)
- [ ] Member invitation expiration
- [ ] Member removal process

## Reference

- https://developers.cloudflare.com/fundamentals/setup/manage-members/policies/
- https://developers.cloudflare.com/fundamentals/setup/manage-members/roles/
- https://developers.cloudflare.com/fundamentals/setup/manage-members/scope/
