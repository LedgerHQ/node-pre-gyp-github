import { Octokit } from "@octokit/rest";
import path from "path";
import fs from "fs";
import mime from "mime-types";

export async function publish({ draft } = {}) {
  function log(message = "") {
    console.log(message);
  }

  const stageDir = path.resolve(process.cwd(), "build", "stage");

  // Validate token
  const token = process.env["GH_TOKEN"];
  if (!token) {
    throw new Error("GH_TOKEN environment variable not found");
  }

  let metadata;
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const content = await fs.promises.readFile(packagePath);
    metadata = JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to read package.json (${error.message})`);
  }

  // Validate repository
  const { repository } = metadata;
  if (!repository || !repository.url) {
    throw new Error("Missing repository.url in package.json");
  }

  const match = repository.url.match(/https?:\/\/([^/]+)\/(.*)(?=\.git)/i);
  if (!match) {
    throw new Error(
      "A correctly formatted Github repository.url was not found in package.json"
    );
  }

  const [, repositoryHost, repositoryUri] = match;
  const [owner, repo] = repositoryUri.split("/");

  const hostPrefix = `https://${repositoryHost}/${owner}/${repo}/releases/download/`;
  // Validate binary
  const { binary } = metadata;
  if (!binary || !binary.host) {
    throw new Error("Missing binary.host in package.json");
  }
  if (hostPrefix !== binary.host) {
    throw new Error(`Invalid binary.host: Should be ${hostPrefix}`);
  }

  // Validate remote path
  if (!binary.remote_path) {
    throw new Error("Missing binary.remote_path");
  }

  const tagName = binary.remote_path.replace(/\{version\}/g, metadata.version);
  const tagDir = path.join(stageDir, tagName);

  // Github API client
  const client = new Octokit({
    auth: token,
    baseUrl: `https://api.${repositoryHost}`,
  });

  const { data: releases } = await client.repos.listReleases({
    owner,
    repo,
  });

  let release = releases.find((release) => release.tag_name === tagName);

  // Create a release if none found
  if (!release) {
    release = await client.repos.createRelease({
      host: repositoryHost,
      owner: owner,
      repo: repo,
      tag_name: metadata.version,
      target_commitish: "master",
      name: "v" + metadata.version,
      body: `${metadata.name} ${metadata.version}`,
      draft: !!draft,
      prerelease: false,
    });
  }

  // List stage dir assets
  const files = await fs.promises.readdir(tagDir);

  if (!files.length) {
    throw new Error("No files found within the stage directory: " + tagDir);
  }

  // Upload assets to Github
  const filesP = await Promise.all(files);
  filesP.forEach(async (file) => {
    if (release && release.assets) {
      const asset = release.assets.find((a) => a.name === file);
      if (asset) {
        log(
          "Staged file " +
            file +
            " found but it already exists in release " +
            release.tag_name +
            ". If you would like to replace it, you must first manually delete it within GitHub."
        );
        return;
      }

      const fileName = file;
      const filePath = path.resolve(tagDir, file);
      const fileContent = await fs.promises.readFile(filePath);

      log("Staged file " + file + " found. Proceeding to upload it.");

      await client.repos.uploadReleaseAsset({
        url: release.upload_url,
        owner: owner,
        id: release.id,
        repo: repo,
        name: fileName,
        data: fileContent,
        contentType: mime.contentType(fileName) || "application/octet-stream",
        contentLength: fileContent.length,
      });

      log(
        "Staged file " +
          fileName +
          " saved to " +
          owner +
          "/" +
          repo +
          " release " +
          release.tag_name +
          " successfully."
      );
    }
  });

  log("Done");
}
