# Telos Usage Examples

This document provides real-world examples of using the Telos extension with Pi.

## Example 1: Feature Development

### Setting a Development Goal

```
You: /goal Implement user authentication with JWT tokens, including login, logout, and token refresh endpoints

Assistant: Goal set successfully.

You: Start by creating the user model.

Assistant: [Creates User model with email, password, etc.]

[... LLM continues automatically ...]

Assistant: I'll continue working on the authentication system. Next, I'll implement the login endpoint...

[... more work ...]

You: /goal

Assistant: Goal Status: ACTIVE
Objective: Implement user authentication with JWT tokens, including login, logout, and token refresh endpoints
Token Budget: Not set
Created: 6/23/2026, 10:30:45 AM

You: /goal pause

Assistant: Goal paused

[... you work on something else ...]

You: /goal resume

Assistant: Goal resumed

You: Show me the complete authentication flow.

Assistant: [Explains the full implementation]

You: We're done with authentication. Mark the goal as complete.

Assistant: [Calls update_goal with status "complete"]
Goal status updated: ACTIVE → COMPLETE
Reason: Authentication system implemented with JWT tokens, including login, logout, and refresh endpoints.

Final statistics:
  Tokens used: 8,432
  Time: 12m
```

## Example 2: Code Refactoring

### Refactoring with Budget Control

```
You: /goal Refactor the payment processing module to use the new payment gateway API (budget: 5000 tokens)

Assistant: Goal set successfully.

You: Start by analyzing the current payment module structure.

Assistant: [Analyzes existing code]

You: /goal

Assistant: Goal Status: ACTIVE
Objective: Refactor the payment processing module to use the new payment gateway API
Token Budget: 5000 / 5000 (0%)
Created: 6/23/2026, 11:00:00 AM

[... work continues ...]

You: /goal

Assistant: Goal Status: BUDGET_LIMITED
Objective: Refactor the payment processing module to use the new payment gateway API
Token Budget: 5023 / 5000 (100%)
Created: 6/23/2026, 11:00:00 AM

BUDGET LIMIT REACHED: The token budget for this goal has been exhausted.
Instructions:
- Stop substantive new work on this goal.
- Summarize the progress made so far.
- List any remaining work that could not be completed.
- Do NOT call update_goal unless the goal is actually complete.

[Agent summarizes progress and remaining work]

You: /goal resume

Assistant: Goal is budget_limited, not paused. Use /goal clear to remove it or set a new goal with higher budget.

You: /goal clear

Assistant: Goal cleared
```

## Example 3: Bug Investigation

### Systematic Bug Investigation

```
You: /goal Investigate and fix the memory leak in the WebSocket connection handler (budget: 8000 tokens)

Assistant: Goal set successfully.

[... LLM begins investigation ...]

Assistant: I'll start by examining the WebSocket connection handler code...

[... investigation continues automatically ...]

Assistant: Continuing investigation: Now checking the event listener cleanup...

[... more investigation ...]

You: What have you found so far?

Assistant: [Calls get_goal and reviews progress]
Based on my investigation, I've identified several potential leak sources:

1. Event listeners not being removed on disconnect
2. Timer references not being cleared
3. Connection map not being cleaned up

I'm currently working on implementing fixes for issue #1.

[... work continues ...]

You: Stop for now, I need to test something.

You: /goal pause

Assistant: Goal paused

[... you test something ...]

You: /goal resume

Assistant: Goal resumed

[... LLM continues where it left off ...]

You: That fixed it! Mark the goal complete.

Assistant: [Calls update_goal]
Goal status updated: ACTIVE → COMPLETE
Reason: Memory leak fixed by properly cleaning up event listeners, timers, and connection map entries on WebSocket disconnect.

Final statistics:
  Tokens used: 6,847 / 8000
  Time: 18m
  Budget remaining: 1,153 tokens
```

## Example 4: Documentation

### Writing Comprehensive Documentation

```
You: /goal Write comprehensive API documentation for the user management endpoints, including request/response examples and error codes

Assistant: Goal set successfully.

[... LLM begins writing documentation ...]

Assistant: I'll start by documenting the user registration endpoint...

[... continues automatically ...]

You: How's the documentation coming along?

Assistant: [Calls get_goal]
I've completed documentation for:
- POST /users/register
- POST /users/login
- GET /users/:id
- PUT /users/:id
- DELETE /users/:id

Still need to document:
- POST /users/:id/password
- GET /users/:id/activity
- Error response format

[... continues ...]

You: Add examples for each endpoint.

Assistant: [Adds request/response examples]

[... continues ...]

You: We're done. Complete the goal.

Assistant: [Calls update_goal]
Goal status updated: ACTIVE → COMPLETE
Reason: Comprehensive API documentation completed for all user management endpoints with request/response examples and error codes.

Final statistics:
  Tokens used: 12,234
  Time: 25m
```

## Example 5: Testing

### Writing Test Suites

```
You: /goal Write unit tests for the ShoppingCart class, covering all public methods and edge cases

Assistant: Goal set successfully.

[... LLM begins writing tests ...]

Assistant: I'll start by setting up the test infrastructure and writing tests for the addItem method...

[... continues automatically ...]

You: What test coverage do we have?

Assistant: [Calls get_goal and reports progress]
Test coverage so far:
- addItem: 100% (happy path, edge cases, errors)
- removeItem: 100% (existing, non-existing, quantity adjustments)
- updateQuantity: 100% (increase, decrease, remove, invalid)
- calculateTotal: 80% (missing: empty cart, large quantities)
- applyDiscount: 0% (not started)

[... continues ...]

You: Make sure to test the discount calculation thoroughly.

Assistant: [Adds comprehensive discount tests]

[... continues ...]

You: Complete the goal.

Assistant: [Calls update_goal]
Goal status updated: ACTIVE → COMPLETE
Reason: Unit test suite completed for ShoppingCart class with 100% coverage of all public methods including edge cases and error conditions.

Final statistics:
  Tokens used: 9,456
  Time: 22m
```

## Example 6: Code Review

### Reviewing Pull Requests

```
You: /goal Review the PR #123 for the new feature flag system, identify any issues, and provide feedback

Assistant: Goal set successfully.

[... LLM reviews the code ...]

Assistant: I'll start by examining the feature flag implementation...

[... continues automatically ...]

You: What issues have you found?

Assistant: [Calls get_goal]
Issues identified so far:
1. Race condition in flag loading (lines 45-52)
2. Missing error handling for network failures
3. Flag cache invalidation not implemented
4. No integration tests for flag toggling

[... continues ...]

You: Provide suggestions for fixing these issues.

Assistant: [Provides detailed suggestions]

[... continues ...]

You: Mark the review complete.

Assistant: [Calls update_goal]
Goal status updated: ACTIVE → COMPLETE
Reason: Code review completed for PR #123. Identified 4 issues and provided actionable suggestions for each.

Final statistics:
  Tokens used: 7,891
  Time: 15m
```

## Example 7: Blocked Goals

### Handling Blockers

```
You: /goal Migrate the database from MySQL to PostgreSQL

Assistant: Goal set successfully.

[... LLM begins migration planning ...]

Assistant: I'll start by analyzing the current MySQL schema...

[... continues ...]

You: /goal

Assistant: Goal Status: BLOCKED
Objective: Migrate the database from MySQL to PostgreSQL
Created: 6/23/2026, 2:00:00 PM

[... context shows goal was marked blocked ...]

You: Why is the goal blocked?

Assistant: [Calls get_goal]
The goal was marked blocked with reason:
"The pg_dump tool is not available in this environment. Database migration cannot proceed without the PostgreSQL command-line tools."

You: Install PostgreSQL tools and resume.

You: [Installs pg_dump and other tools]

You: /goal resume

Assistant: Goal resumed

[... migration continues ...]
```

## Example 8: Multi-Session Work

### Persistent Goals Across Sessions

```
You: /goal Implement a complete REST API for the inventory management system

Assistant: Goal set successfully.

[... work on API for a while ...]

You: /goal pause

Assistant: Goal paused

[... exit Pi, come back later ...]

You: pi -e /path/to/telos

[... Pi starts ...]

You: /goal

Assistant: Goal Status: PAUSED
Objective: Implement a complete REST API for the inventory management system
Created: 6/23/2026, 9:00:00 AM

You: /goal resume

Assistant: Goal resumed

[... work continues where left off ...]
```

## Best Practices

### 1. Clear, Specific Objectives

Good:
```
/goal Implement JWT-based authentication with login, logout, and token refresh endpoints
```

Bad:
```
/goal Fix auth
```

### 2. Use Budgets for Cost Control

Good:
```
/goal Refactor the payment module (budget: 5000 tokens)
```

This prevents runaway token usage on long tasks.

### 3. Pause When Needed

```
/goal pause
```

Use this when you need to:
- Test something manually
- Switch to a different task
- Take a break
- Investigate an issue

### 4. Let Continuation Work

After setting a goal, let the session go idle occasionally. Telos will automatically continue working, which is especially useful for:
- Multi-step refactoring
- Comprehensive testing
- Large documentation tasks
- Systematic code reviews

### 5. Check Progress Regularly

```
/goal
```

Use this to:
- See current status
- Check token usage
- Verify budget remaining
- Review the objective

### 6. Complete Goals Properly

```
Mark the goal as complete with a summary.
```

This gives you:
- A record of what was accomplished
- Token usage statistics
- Time spent
- A clear completion marker

### 7. Handle Blockers Appropriately

When a goal is blocked:
- Understand why it's blocked
- Resolve the blocker
- Resume the goal
- Or clear it if no longer relevant

## Common Workflows

### Feature Development Workflow

1. Set goal: `/goal Implement [feature]`
2. Start work: "Begin by..."
3. Let continuation handle multi-step work
4. Check progress: `/goal`
5. Pause when needed: `/goal pause`
6. Resume when ready: `/goal resume`
7. Complete when done: "Mark the goal complete"

### Bug Fix Workflow

1. Set goal: `/goal Fix [bug description]`
2. Investigate: "Start by analyzing..."
3. Let continuation drive investigation
4. Implement fix
5. Test the fix
6. Complete goal

### Documentation Workflow

1. Set goal: `/goal Write docs for [topic]`
2. Let continuation handle sections
3. Review and refine
4. Complete goal

### Code Review Workflow

1. Set goal: `/goal Review PR #[number]`
2. Let continuation examine code
3. Identify issues
4. Provide suggestions
5. Complete goal

## Tips for Maximum Productivity

1. **Be Specific**: Clear objectives lead to better results
2. **Set Budgets**: Control costs on long tasks
3. **Trust Continuation**: Let it handle multi-step work
4. **Check Progress**: Use `/goal` to stay informed
5. **Pause Often**: Maintain control over the workflow
6. **Complete Goals**: Keep track of accomplishments
7. **Handle Blockers**: Resolve or clear blocked goals promptly

## Troubleshooting Examples

### Continuation Not Triggering

```
You: /goal Test continuation
[Wait 10 seconds, nothing happens]

You: /goal

Assistant: Goal Status: ACTIVE
Objective: Test continuation

[Continuation should trigger, but doesn't]

Solution: Check that the agent is truly idle (no pending operations)
```

### Goal Not Persisting

```
You: /goal Test persistence
[Exit Pi]
[Restart Pi]
You: /goal
Assistant: No active goal

Solution: Ensure session is being saved (not ephemeral)
```

### Budget Not Enforced

```
You: /goal Test budget (budget: 100 tokens)
[Do lots of work, way over 100 tokens]
You: /goal
Assistant: Goal Status: ACTIVE (should be BUDGET_LIMITED)

Solution: Token counting may not be working in your Pi version
```

These examples should help you get the most out of Telos!