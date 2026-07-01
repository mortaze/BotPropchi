import { prisma } from '../prisma/client';
import { postService } from '../services/post.service';
import { logger } from '../utils/logger';

/**
 * Diagnostic tool: Run with `npx ts-node scripts/diagnose-commands.ts`
 * Traces the full command lifecycle and reports mismatches.
 */
async function main() {
  console.log('=== COMMAND DIAGNOSTIC ===\n');

  // 1. List ALL PostCommand records
  const commands = await prisma.postCommand.findMany({
    include: { post: { select: { id: true, title: true, status: true, isPublished: true, slug: true, command: true } } },
    orderBy: { id: 'asc' },
  });
  console.log(`[DB] Total PostCommand records: ${commands.length}`);
  for (const cmd of commands) {
    console.log(`  - id=${cmd.id} command="${cmd.command}" postId=${cmd.postId} post.title="${cmd.post.title}" post.status=${cmd.post.status} post.isPublished=${cmd.post.isPublished} post.slug=${cmd.post.slug} aliases=${JSON.stringify(cmd.aliases)}`);
  }

  // 2. Build the command map the same way getCommandMap does
  const publishedPosts = await prisma.post.findMany({
    where: { status: 'PUBLISHED', isPublished: true },
    include: { commands: true },
  });
  const map = new Map<string, any>();
  for (const post of publishedPosts) {
    if (post.command) {
      map.set(post.command, post);
    }
    for (const cmd of post.commands) {
      map.set(cmd.command, post);
      if (cmd.aliases && Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) {
          map.set(alias, post);
        }
      }
    }
  }
  console.log(`\n[BUILD] Command map built from ${publishedPosts.length} published posts → ${map.size} entries`);
  for (const [key, post] of map) {
    console.log(`  map["${key}"] → post #${post.id} "${post.title}"`);
  }

  // 3. Simulate resolveCommand for every command
  console.log('\n[RESOLVE] Simulating resolveCommand for all commands:');
  for (const cmd of commands) {
    const result = await postService.resolveCommand(cmd.command);
    const status = result ? `OK → post #${result.id} "${result.title}"` : 'NOT FOUND';
    console.log(`  resolveCommand("${cmd.command}") → ${status}`);
  }

  // 4. Check for buttons with type=COMMAND in post.buttons JSON
  console.log('\n[BUTTONS] Scanning post.buttons JSON for COMMAND type:');
  const allPosts = await prisma.post.findMany({ select: { id: true, title: true, buttons: true, status: true, isPublished: true } });
  for (const post of allPosts) {
    if (!post.buttons) continue;
    const raw = post.buttons as any;
    const btnArrays = raw?.messages ? Object.values(raw.messages).flat().flat() : (Array.isArray(raw) ? raw.flat() : []);
    for (const btn of btnArrays) {
      if (btn?.type === 'COMMAND') {
        const value = btn.value || '';
        const foundInMap = map.has(value);
        const matchingCmd = commands.find(c => c.command === value);
        console.log(`  post #${post.id} "${post.title}" (status=${post.status} published=${post.isPublished}): COMMAND btn text="${btn.text}" value="${value}" → map.has?=${foundInMap} postCommand.exists?=${!!matchingCmd}`);
      }
    }
  }

  // 5. Check post_keyboards table
  console.log('\n[KEYBOARDS] Scanning post_keyboards for COMMAND type:');
  const kbButtons = await prisma.postKeyboard.findMany({
    where: { type: 'COMMAND' },
    include: { post: { select: { id: true, title: true, status: true, isPublished: true } } },
  });
  console.log(`  Total COMMAND keyboard buttons: ${kbButtons.length}`);
  for (const kb of kbButtons) {
    const value = kb.value || '';
    const foundInMap = map.has(value);
    console.log(`  keyboard id=${kb.id} post=${kb.post.title}(${kb.postId}) type=COMMAND value="${value}" text="${kb.text}" → map.has?=${foundInMap}`);
  }

  // 6. Check for case mismatches
  console.log('\n[CASE] Checking case mismatches between DB and lowercase:');
  for (const cmd of commands) {
    const lower = cmd.command.toLowerCase();
    if (cmd.command !== lower) {
      console.log(`  MISMATCH: command="${cmd.command}" vs lowercase="${lower}" (postId=${cmd.postId})`);
    }
  }

  // 7. Test what the bot handler would do for each command
  console.log('\n[HANDLER] Simulating callback_data parsing for each command:');
  for (const cmd of commands) {
    const callbackData = `post:user:cmd:${cmd.command}`;
    // Simulate the regex
    const match = callbackData.match(/^post:user:cmd:(.+)$/);
    if (!match) { console.log(`  "${callbackData}" → NO REGEX MATCH`); continue; }
    const raw = match[1].trim().replace(/\s+/g, ' ');
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const cmdName = normalized.slice(1).toLowerCase();
    const result = await postService.resolveCommand(cmdName);
    console.log(`  callback_data="${callbackData}" → match="${match[1]}" → cmdName="${cmdName}" → resolveCommand → ${result ? `OK post #${result.id}` : 'NOT FOUND'}`);
  }

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
