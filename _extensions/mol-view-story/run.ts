#!/usr/bin/env deno run --allow-read --allow-run --allow-net --allow-write --allow-env

import { walk } from "jsr:@std/fs@^1.0.20";
import { join, dirname } from "jsr:@std/path@^1.1.3";

/**
 * Pre-render script for mol-view-story Quarto extension
 * Walks the project directory looking for story.yaml files and runs mvs build on them
 */

async function findStoryFiles(rootDir: string): Promise<string[]> {
  const storyFiles: string[] = [];

  try {
    for await (const entry of walk(rootDir, {
      includeDirs: false,
      match: [/story\.yaml$/],
      skip: [
        /node_modules/,
        /_site/,
        /\.git/,
        /\.quarto/,
        /_extensions/,
        /\.mol-view-stories-repo/,
      ],
    })) {
      storyFiles.push(entry.path);
    }
  } catch (error) {
    console.error(`Error walking directory: ${error}`);
  }

  return storyFiles;
}

async function createQmdWrapper(storyDir: string): Promise<void> {
  const qmdPath = join(storyDir, "index.qmd");
  const storyName = storyDir.split("/").pop() || "Molecular Story";
  const title = storyName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const qmdContent = `---
title: "${title}"
format:
  html:
    page-layout: full
---

<iframe src="story.html" width="100%" height="800px" frameborder="0" style="border: none; min-height: 800px;"></iframe>

<script>
// Auto-resize iframe to content height
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'resize') {
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.style.height = e.data.height + 'px';
    }
  }
});

// Alternative: Set iframe to viewport height minus header
function resizeIframe() {
  const iframe = document.querySelector('iframe');
  if (iframe) {
    const headerHeight = document.querySelector('.navbar')?.offsetHeight || 0;
    const viewportHeight = window.innerHeight;
    iframe.style.height = (viewportHeight - headerHeight - 40) + 'px';
  }
}

window.addEventListener('load', resizeIframe);
window.addEventListener('resize', resizeIframe);
</script>
`;

  await Deno.writeTextFile(qmdPath, qmdContent);
  console.log(`   Created wrapper: ${qmdPath}`);
}

async function runMvsBuild(storyPath: string): Promise<boolean> {
  const storyDir = dirname(storyPath);
  const outputFile = join(storyDir, "story.html");

  console.log(`\n📦 Building story: ${storyPath}`);
  console.log(`   Output: ${outputFile}`);

  try {
    const command = new Deno.Command("mvs", {
      args: ["build", storyDir, "-f", "html", "-o", outputFile],
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();
    const { code, stdout, stderr } = await process.output();

    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    if (stdoutText) {
      console.log(stdoutText);
    }

    if (code !== 0) {
      console.error(`❌ Failed to build ${storyPath}`);
      if (stderrText) {
        console.error(stderrText);
      }
      return false;
    }

    // Create QMD wrapper file to preserve Quarto header and sidebar
    await createQmdWrapper(storyDir);

    console.log(`✅ Successfully built ${storyPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error running mvs build for ${storyPath}: ${error}`);
    return false;
  }
}

async function main() {
  console.log("🔍 Searching for story.yaml files in Quarto project...\n");

  // Get the current working directory (should be the Quarto project root)
  const projectRoot = Deno.cwd();
  console.log(`Project root: ${projectRoot}`);

  // Find all story.yaml files
  const storyFiles = await findStoryFiles(projectRoot);

  if (storyFiles.length === 0) {
    console.log("\n📭 No story.yaml files found in project");
    Deno.exit(0);
  }

  console.log(`\n📋 Found ${storyFiles.length} story file(s):`);
  storyFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });

  // Build each story
  let successCount = 0;
  let failureCount = 0;

  for (const storyFile of storyFiles) {
    const success = await runMvsBuild(storyFile);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Build Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log(`   📦 Total: ${storyFiles.length}`);
  console.log("=".repeat(50) + "\n");

  // Exit with error if any builds failed
  if (failureCount > 0) {
    Deno.exit(1);
  }
}

// Run the main function
if (import.meta.main) {
  main();
}
