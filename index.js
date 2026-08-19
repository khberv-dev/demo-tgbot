const express = require("express");
const { Bot, InputFile } = require("grammy");
const { addCenterPlaceholder, TEXT } = require("./src/placeholder");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// Telegram's Bot API caps downloads at 20 MB.
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const bot = new Bot(token);

bot.command("start", (ctx) =>
  ctx.reply(`Send me an image and I'll put "${TEXT}" in the middle of it.`),
);

async function handleImage(ctx, fileSize) {
  if (fileSize && fileSize > MAX_FILE_SIZE) {
    await ctx.reply("That image is too large for me to download (20 MB max).");
    return;
  }

  await ctx.replyWithChatAction("upload_photo");

  const file = await ctx.getFile();
  if (!file.file_path) {
    throw new Error("Telegram did not return a file_path for this file");
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`,
  );
  if (!response.ok) {
    // Not response.url — it contains the bot token.
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const output = await addCenterPlaceholder(Buffer.from(await response.arrayBuffer()));

  // Sent as a document so Telegram doesn't re-compress the result.
  await ctx.replyWithDocument(new InputFile(output, "placeholder.png"), {
    reply_parameters: { message_id: ctx.msg.message_id },
  });
}

bot.on("message:photo", (ctx) => {
  // Photos arrive in several sizes, ascending — the last one is the largest.
  const photo = ctx.msg.photo[ctx.msg.photo.length - 1];
  return handleImage(ctx, photo.file_size);
});

bot.on("message:document", (ctx) => {
  const doc = ctx.msg.document;
  if (!doc.mime_type?.startsWith("image/")) {
    return ctx.reply("That's not an image. Send me a photo or an image file.");
  }
  return handleImage(ctx, doc.file_size);
});

bot.on("message", (ctx) => ctx.reply("Send me an image."));

bot.catch(async (err) => {
  console.error("Error while handling update", err.ctx?.update.update_id, err.error);
  try {
    await err.ctx.reply("Something went wrong processing that image. Try another one.");
  } catch {
    // The reply itself failed (blocked bot, network) — nothing more to do.
  }
});

bot
  .start({ onStart: ({ username }) => console.log(`Bot @${username} is running`) })
  .catch((err) => {
    console.error("Bot failed to start:", err.message);
    process.exit(1);
  });

// Health endpoint, mostly so a host can see the process is alive.
const PORT = Number(process.env.PORT) || 80;
const app = express();

app.use((req, res) => res.type("text/plain").send("Bot is working well"));

const server = app.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));
server.on("error", (err) => console.error("HTTP server error:", err.message));

// Let long polling finish the current update before the process exits.
function shutdown() {
  server.close();
  bot.stop();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
