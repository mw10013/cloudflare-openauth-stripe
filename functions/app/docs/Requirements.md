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
  - active - Current member
- Membership actions:
  - Owners can revoke a member's access (hard deletes the membership record)
  - Members can leave an account (hard deletes the membership record)
  - Owners can invite a previously removed member again (creates a new membership record)

## User Deletion Strategy

- Users must be soft-deleted rather than hard-deleted due to Stripe integration requirements
- Upon soft deletion of user, all AccountMembers for that user must be hard deleted, but the Account is untouched.
- Soft deletion is implemented using `deletedAt` timestamp in the User record
- Email addresses must remain unique across all users (including soft-deleted users)
- When a user attempts to register with an email that belongs to a soft-deleted user:
  - The system will reactivate the soft-deleted user record and insert AccountMember record.
  - This maintains the connection to existing Stripe customer records
  - All existing account relationships are preserved
- Email change process:
  - When a user changes their email, the corresponding Stripe customer email must be updated
  - System must ensure email synchronization between User and Stripe customer

## Data Integrity Constraints

- Account ownership is permanent but resources can be transferred
- Stripe customers and subscriptions are permanently linked to accounts
- Financial records must be preserved even when users are deleted
- Queries for active users must include `WHERE deletedAt IS NULL` conditions

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
