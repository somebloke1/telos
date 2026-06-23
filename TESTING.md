# Telos Testing Guide

This document provides step-by-step instructions for testing the Telos extension.

## Quick Start Test

### 1. Load the Extension

```bash
cd /home/dgk/workspace/telos
pi -e ./src/index.ts
```

### 2. Basic Goal Operations

Test setting a goal:
```
/goal Implement a simple REST API with user endpoints
```

Expected output: "Goal set successfully."

View the goal:
```
/goal
```

Expected output: Shows goal status, objective, and creation time.

### 3. Pause and Resume

Pause the goal:
```
/goal pause
```

Expected output: "Goal paused"

Resume the goal:
```
/goal resume
```

Expected output: "Goal resumed"

### 4. Clear the Goal

```
/goal clear
```

Expected output: "Goal cleared"

## LLM Tool Testing

### Test get_goal

Prompt the LLM:
```
What is the current goal for this session?
```

The LLM should call `get_goal` and report back.

### Test create_goal

Prompt the LLM:
```
Create a goal to refactor the authentication module with a token budget of 5000 tokens.
```

The LLM should call `create_goal` with the objective and budget.

### Test update_goal

First, create a goal, then:
```
Mark the current goal as complete with a summary of what was accomplished.
```

The LLM should call `update_goal` with status "complete" and a reason.

## Automatic Continuation Testing

### 1. Set a Goal

```
/goal Write comprehensive tests for the user service
```

### 2. Start Work

```
Start writing unit tests for the UserService class.
```

### 3. Let Session Go Idle

After the LLM completes its response, wait a few seconds without typing.

### 4. Observe Continuation

The LLM should automatically continue working on the goal without additional prompts.

## Token Budget Testing

### 1. Create Budgeted Goal

```
/goal Analyze the codebase and create documentation (budget: 1000 tokens)
```

### 2. Work Until Budget Exhausted

Ask the LLM to perform work that will exceed the budget:
```
Provide a detailed analysis of every file in the project.
```

### 3. Observe Budget Limit

When the budget is exhausted, continuation should stop and you should see a budget limit warning.

## Edge Cases Testing

### Empty Objective

```
/goal
```
Then try:
```
/goal [just spaces]
```

Expected: Error message about empty objective.

### Too Long Objective

Create a very long objective (>4000 chars):
```
/goal [paste 5000 characters]
```

Expected: Error about objective length.

### Create Goal When One Exists

```
/goal First goal
/goal Second goal
```

Expected: Prompt for confirmation before replacing.

### Invalid Status Update

Try to update goal status to something invalid (through LLM):
```
Update the goal status to "paused"
```

Expected: Error - LLM can only set "complete" or "blocked".

## Session Persistence Testing

### 1. Create a Goal

```
/goal Test persistence across sessions
```

### 2. Exit and Restart

Press Ctrl+C to exit, then restart Pi:
```bash
pi -e ./src/index.ts
```

### 3. Check Goal Persistence

```
/goal
```

Expected: Goal should still exist with its status.

## Error Handling Testing

### Goal Operations Without Goal

Try these when no goal is set:
```
/goal pause
/goal resume
/goal clear
```

Expected: Appropriate error messages.

### Invalid Budget

```
/goal Test with invalid budget: -1000
```

Expected: Error about invalid budget.

## Integration with Other Pi Features

### Test with File Operations

```
/goal Read and analyze package.json
```

The LLM should be able to use read, write, etc. while working toward the goal.

### Test with /reload

```
/goal Test reload functionality
```

Make changes to the extension, then:
```
/reload
```

Goal should persist after reload.

## Performance Testing

### Token Usage Monitoring

Create a goal with a known budget:
```
/goal Monitor token usage (budget: 2000 tokens)
```

Work through several turns and check:
```
/goal
```

Verify token counts are increasing correctly.

### Continuation Frequency

Set a goal and let the session go idle multiple times. Verify:
- Continuation triggers at appropriate intervals
- Not too frequent (minimum 2 seconds)
- Respects paused/blocked states

## Troubleshooting

### Extension Not Loading

If Pi doesn't recognize the extension:
- Check file path is correct
- Verify TypeScript syntax is valid
- Check for runtime errors

### Goal Not Persisting

If goals don't survive session reload:
- Check session file is being saved
- Verify custom entries are being written
- Check session manager is accessible

### Continuation Not Working

If automatic continuation doesn't trigger:
- Verify goal is in "active" status
- Check agent is actually idle
- Verify continuation is enabled
- Check minimum interval hasn't passed

## Test Checklist

Use this checklist to verify all functionality:

- [ ] Set goal with `/goal <objective>`
- [ ] View goal with `/goal`
- [ ] Pause goal with `/goal pause`
- [ ] Resume goal with `/goal resume`
- [ ] Clear goal with `/goal clear`
- [ ] LLM can call `get_goal`
- [ ] LLM can call `create_goal`
- [ ] LLM can call `update_goal` with "complete"
- [ ] LLM can call `update_goal` with "blocked"
- [ ] Automatic continuation triggers
- [ ] Token budget is tracked
- [ ] Budget limit stops continuation
- [ ] Goal persists across session reload
- [ ] Empty objectives are rejected
- [ ] Long objectives are rejected
- [ ] Invalid status transitions are rejected
- [ ] Confirmation for replacing non-complete goal
- [ ] Token budget validation works
- [ ] Goal status displayed correctly

## Reporting Issues

If you find a bug or unexpected behavior:

1. Document the exact steps to reproduce
2. Record expected vs. actual behavior
3. Check console for error messages
4. Note Pi version and any relevant configuration
5. Open an issue on GitHub with details

## Success Criteria

The extension is working correctly if:
- All goal commands work as documented
- LLM tools function properly
- Automatic continuation triggers appropriately
- Token budgets are enforced
- Goals persist across sessions
- Error messages are clear and helpful
- The extension doesn't interfere with normal Pi operation