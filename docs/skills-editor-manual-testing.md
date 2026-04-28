# Skills Editor Manual Testing Guide

Use this guide to manually validate the Skills Editor before handing a branch to another developer or reviewer.

## Instructions

- Open the Skills Editor and enter the same `{ORG}` and `{SITE}` used for the test repository.
- Use a disposable test site or test-only skill, prompt, and MCP names. Do not use production secrets in MCP auth fields.
- Prefix test data with your initials and date, for example `nv-2026-04-28-content-qa`.
- When a scenario asks you to verify storage, inspect the DA source/config view for the same `{ORG}` and `{SITE}`:
  - Skill files live under `.da/skills/{skill-id}.md`.
  - Skill rows live in the `skills` sheet.
  - Prompt rows live in the `prompts` sheet.
  - MCP rows live in the `mcp-servers` sheet.

## Test Data

Use unique IDs so tests are easy to clean up:

- Skill ID: `{prefix}-campaign-seo-check`
- Prompt title: `{prefix} Campaign SEO Brief`
- MCP key: `{prefix}-test-mcp`
- Optional MCP endpoint: use the team-approved test SSE endpoint for manual validation. Checkout provided MCP (TBD)

## Scenario 0: Canvas Entry Points Open the Correct Tabs

1. Open a page in canvas.
2. Open the tools or assistant menu that contains the `+ Manage Skills` and `+ Manage Prompts` actions.
3. Click `+ Manage Skills`.
4. Confirm the Skills Editor opens with the `Skills` tab active.
5. Return to canvas.
6. Click `+ Manage Prompts`.
7. Confirm the Skills Editor opens with the `Prompts` tab active.

Expected result: canvas entry points deep-link to the editor and select the correct tab instead of always opening the default tab.

## Scenario 1: Create, Edit, and Delete a Skill

1. Open the `Skills` tab.
2. Click `+ New Skill`.
3. Enter the test skill ID.
4. Paste skill markdown with frontmatter:

   ```md
   ---
   name: Campaign SEO Check
   description: Reviews campaign pages for SEO title, description, headings, and CTA clarity.
   status: approved
   ---

   Use this skill when the user asks for an SEO review of a campaign landing page.

   Check:
   - Page title
   - Meta description
   - H1 and H2 structure
   - Primary CTA clarity
   ```

5. Click `Save`.
6. Confirm the skill appears in the Skills list with an approved status.
7. Verify `.da/skills/{skill-id}.md` was created and contains the saved markdown.
8. Verify the `skills` sheet has a row for the same skill ID with approved status.
9. Open the skill again, change the description or add one checklist item, and click `Save`.
10. Verify `.da/skills/{skill-id}.md` and the `skills` sheet row both reflect the edit.
11. Reload the page and confirm the edited content persists.
12. Delete the skill from the editor footer or card menu.
13. Confirm the delete dialog, then confirm the skill no longer appears after reload.
14. Verify `.da/skills/{skill-id}.md` was deleted.
15. Verify the `skills` sheet row for the skill was removed.

Expected result: create, update, persistence, and delete all work in both `.da/skills` and the `skills` sheet without orphaned cards or stale editor state.

## Scenario 2: Create a Skill Without Frontmatter

1. Open the `Skills` tab.
2. Click `+ New Skill`.
3. Enter a new test skill ID, for example `{prefix}-frontmatter-injection`.
4. Paste body-only markdown:

   ```md
   Use this skill when an author asks for a campaign page launch checklist.

   Confirm the page has a title, metadata, hero image, primary CTA, and no placeholder copy.
   ```

5. Click `Save`.
6. Confirm the editor adds frontmatter automatically.
7. Confirm the status message says frontmatter was added and asks the author to expand name and description.
8. Verify `.da/skills/{skill-id}.md` includes the injected frontmatter.
9. Verify the `skills` sheet has a row for the skill.
10. Reload, reopen the skill, and confirm the saved markdown includes frontmatter.
11. Clean up by deleting the skill.

Expected result: the save flow injects a minimal `name`, `description`, and `status` frontmatter block instead of saving body-only content.

## Scenario 3: Create, Edit, and Delete a Prompt

1. Open the `Prompts` tab.
2. Click `+ New Prompt`.
3. Enter:
   - Title: `{prefix} Campaign SEO Brief`
   - Category: `SEO`
   - Prompt: `Review the current page for SEO readiness. Return title, description, heading, CTA, and image recommendations.`
   - Icon: any short test value, if the field is available.
4. Click `Save`.
5. Confirm the prompt appears in the Prompts list.
6. Verify the `prompts` sheet has a row for the prompt title, category, icon, and body.
7. Open it, update the prompt body, and click `Save`.
8. Verify the `prompts` sheet row reflects the edited body.
9. Click `Add to Chat` and confirm the prompt text is placed into the chat input.
10. Click `Run / Test` and confirm the prompt is sent to chat.
11. Delete the prompt and confirm it no longer appears after reload.
12. Verify the `prompts` sheet row for the prompt was removed.

Expected result: prompt CRUD updates the `prompts` sheet, and prompt-to-chat actions target the chat drawer correctly.

## Scenario 4: Register, Edit, Enable, Disable, and Delete an MCP Server

1. Open the `MCPs` tab.
2. Click `+ Register MCP`.
3. Enter:
   - MCP key: `{prefix}-test-mcp`
   - URL: the team-approved test SSE endpoint
   - Description: `Manual test MCP server`
   - Auth header name/value: leave blank unless the test endpoint requires a disposable test credential.
4. Click `Register`.
5. Confirm the MCP appears under `Custom`.
6. Verify the `mcp-servers` sheet has a row for the MCP key, URL, description, and enabled state.
7. Open the MCP, edit the description, and click `Update`.
8. Verify the `mcp-servers` sheet row reflects the edited description.
9. Open the card menu and click `Disable`.
10. Confirm the card status changes to disabled.
11. Verify the `mcp-servers` sheet row reflects the disabled state.
12. Open the card menu again and click `Enable`.
13. Confirm the card status changes to enabled.
14. Verify the `mcp-servers` sheet row reflects the enabled state.
15. Open the card menu and delete the MCP.
16. Confirm the MCP no longer appears after reload.
17. Verify the `mcp-servers` sheet row for the MCP was removed.

Expected result: MCP registration, update, enable/disable state, and deletion persist through reloads and are reflected in the `mcp-servers` sheet.

## Scenario 5: Enable and Disable Tools

1. Open the `MCPs` tab.
2. Open a built-in MCP such as `da-tools`, or open the custom test MCP if it exposes tools.
3. In the tools list, disable one low-risk tool using its checkbox.
4. Confirm the status message says the tool was disabled.
5. Reload the page and reopen the same MCP.
6. Confirm the tool remains disabled.
7. Re-enable the tool.
8. Reload and confirm it remains enabled.

Expected result: tool overrides persist, and disabled tools are not silently re-enabled by reload.

## Scenario 6: Click an Agent to List Tools

1. Open the `Agents` tab.
2. Click the built-in `DA Assistant` card.
3. Confirm the editor panel opens with `Associated Tools`.
4. Confirm DA tools are listed, including expected built-ins such as `content_read`, `content_update`, `da_get_skill`, and `write_project_memory`.
5. If a custom MCP is enabled, confirm its tools appear as `mcp__{serverId}__{toolName}`.

Expected result: selecting an agent lists the tools available to that agent, including DA tools and enabled MCP tools.

## Scenario 7: Verify Project Memory

Goal: prove the agent can write durable project memory and the Skills Editor can display it.

1. Open the Chat drawer.
2. Ask:

   ```text
   Remember this for this project: campaign pages should always use "Start your free trial" as the primary CTA unless the page brief says otherwise.
   ```

3. Wait for the assistant to confirm it saved the memory.
4. Open the `Memory` tab.
5. Confirm `.da/agent/memory.md` includes the CTA convention.
6. Start a new chat or reload the page.
7. Ask:

   ```text
   What primary CTA convention should I use for campaign pages on this site?
   ```

8. Confirm the assistant answers with the remembered CTA convention.

Expected result: the memory file is written, visible in the Memory tab, and used in a later assistant response.

## Scenario 8: Ask the LLM to List Skills

1. Open the Chat drawer.
2. Ask:

   ```text
   List the available skills for this site. Include each skill ID and a one-line description when available.
   ```

3. Confirm the assistant returns the known skills from the current site.
4. Cross-check at least one returned skill against the Skills tab.

Expected result: the assistant can enumerate skills using the current site context, not generic or stale data.

## Scenario 9: Ask the LLM for the Verbatim Text of a Skill

1. Ensure a known test skill exists.
2. Open the Chat drawer.
3. Ask:

   ```text
   Give me the verbatim markdown for the skill "{skill-id}". Do not summarize it.
   ```

4. Compare the response to the skill body shown in the Skills editor.

Expected result: the assistant returns the exact skill markdown, including frontmatter and body, with no paraphrasing.

## Scenario 10: Trigger an LLM Skill Suggestion

Goal: verify repeated requests cause the assistant to suggest saving a reusable skill.

1. Open the Chat drawer.
2. Send this request three times in a row, making only the page name different each time:

   ```text
   For the {page-name} campaign page, review whether the SEO title, meta description, H1, hero copy, and CTA are ready for launch. Return a concise checklist with pass/fail notes.
   ```

3. After the third request, confirm the assistant suggests creating a reusable skill for this recurring workflow.
4. Accept the suggestion if the UI offers an action, or navigate to the Skills tab if the editor opens automatically.
5. Confirm the New Skill drawer is populated with a suggested skill ID and markdown body.
6. Review the generated markdown and click `Save`.
7. Confirm the new skill appears in the Skills list.
8. Clean up by deleting the generated skill.

Expected result: repeated similar requests produce a skill suggestion handoff into the Skills editor.

## Scenario 11: Keyboard Navigation and Accessibility Smoke Test

1. Reload the Skills Editor.
2. Use `Tab` to move through the top tabs, search field, action buttons, cards, card menus, editor fields, and footer buttons.
3. Use `Enter` or `Space` on a skill card and confirm it opens the editor.
4. Use `Enter` or `Space` on an agent card and confirm it opens Associated Tools.
5. Use `Enter` or `Space` on a built-in MCP card and confirm it opens the tools panel.
6. Open a card menu with the keyboard and confirm menu items can be reached and activated.
7. Open an editor drawer, then use `Tab` through all fields and actions.
8. Close the drawer and confirm focus returns to a logical control near where the drawer was opened.
9. Confirm disabled controls are skipped and visible focus is always present.
10. Confirm status messages, loading states, and memory loading text are announced or visibly updated.

Expected result: all core flows are usable without a mouse, focus does not get trapped unexpectedly, and keyboard activation matches click behavior.

## Cleanup Checklist

- Delete all test skills.
- Delete all test prompts.
- Delete all custom test MCP servers.
- Re-enable any tool disabled during testing.
- Remove test-only project memory if it should not remain in the shared test site.
- Reload the Skills Editor and confirm the catalog is back to its pre-test state.
