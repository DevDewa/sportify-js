import SpotifyWebApi from 'spotify-web-api-node';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ytSearch from 'yt-search';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import os from 'os';

dotenv.config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

const LOGO = `
██████╗ ██╗   ██╗██████╗ ██████╗  █████╗     ███████╗ ██████╗██████╗ ██╗██████╗ ████████╗
██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔══██╗    ██╔════╝██╔════╝██╔══██╗██║██╔══██╗╚══██╔══╝
██████╔╝██║   ██║██████╔╝██████╔╝███████║    ███████╗██║     ██████╔╝██║██████╔╝   ██║   
██╔═══╝ ██║   ██║██╔══██╗██╔══██╗██╔══██║    ╚════██║██║     ██╔══██╗██║██╔═══╝    ██║   
██║     ╚██████╔╝██║  ██║██████╔╝██║  ██║    ███████║╚██████╗██║  ██║██║██║        ██║   
╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝    ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   
`;

function getProxyConfig() {
  const proxy = process.env.PROXY_STRING;
  if (!proxy) return null;
  
  const [host, port, username, password] = proxy.split(':');
  return {
    host,
    port,
    auth: { username, password }
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkProxyStatus() {
  printDivider();
  console.log(chalk.cyan('📡 CHECKING CONNECTION STATUS'));
  
  try {
    // Cek IP asli
    const noProxyResponse = await fetch('https://api.ipify.org?format=json');
    const noProxyData = await noProxyResponse.json();
    console.log(chalk.yellow('➤ REAL IP      :'), noProxyData.ip);

    // Coba dengan proxy
    if (process.env.PROXY_STRING) {
      try {
        const proxyResponse = await fetch('https://api.ipify.org?format=json', {
          agent: getProxyConfig()
        });
        const proxyData = await proxyResponse.json();
        console.log(chalk.green('➤ PROXY IP     :'), proxyData.ip);
        console.log(chalk.green('➤ PROXY STATUS : ACTIVE'));
      } catch {
        console.log(chalk.red('➤ PROXY STATUS : NOT ACTIVE'));
        console.log(chalk.white('➤ MODE        : NO PROXY'));
      }
    } else {
      console.log(chalk.white('➤ MODE        : NO PROXY'));
    }
  } catch (error) {
    console.log(chalk.red('➤ CONNECTION ERROR:', error.message));
  }
}

async function getAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return data.body['access_token'];
  } catch (error) {
    console.error('Error mendapatkan access token:', error);
  }
}

async function searchTracks(query) {
  try {
    await getAccessToken();
    const result = await spotifyApi.searchTracks(query);
    
    const tracks = result.body.tracks.items.map(track => ({
      nama: track.name,
      artis: track.artists[0].name,
      album: track.album.name,
      url: track.external_urls.spotify
    }));

    console.log(chalk.cyan('\n📝 HASIL PENCARIAN SPOTIFY:'));
    tracks.forEach((track, index) => {
      console.log(chalk.white(`${index + 1}. ${track.artis} - ${track.nama}`));
    });

    return tracks;
  } catch (error) {
    console.error('Error mencari lagu:', error);
    return null;
  }
}

async function searchYouTube(trackName, artist, maxRetries = 3) {
  console.log(chalk.cyan('\n🔍 MENCARI DI YOUTUBE:'));
  console.log(chalk.white(`➤ Lagu: ${trackName}`));
  console.log(chalk.white(`➤ Artis: ${artist}`));

  const queryVariations = [
    `${trackName} ${artist} official audio`,
    `${trackName} ${artist} lyrics`,
    `${trackName} ${artist}`,
    `${artist} ${trackName}`,
    `${trackName} ${artist} full audio`,
    `${trackName} cover`
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const searchQuery of queryVariations) {
      try {
        console.log(chalk.gray(`\nMencoba query: "${searchQuery}"`));
        const result = await ytSearch(searchQuery);
        
        if (result.videos.length > 0) {
          const video = result.videos[0];
          console.log(chalk.green(`✓ Video ditemukan: ${video.title}`));
          return video.url;
        }
      } catch (error) {
        console.error(chalk.red(`Error pencarian: ${error.message}`));
        await delay(2000);
        continue;
      }
    }
    
    if (attempt < maxRetries) {
      console.log(chalk.yellow(`\nPercobaan ${attempt} gagal, mencoba lagi...`));
      await delay(5000);
    }
  }
  
  console.log(chalk.red('\nTidak dapat menemukan video yang sesuai.'));
  return null;
}

// Fungsi untuk membuat direktori jika belum ada
function createDirectoryIfNotExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(chalk.green(`✓ Membuat direktori: ${dirPath}`));
  }
}

// Fungsi untuk mendapatkan path desktop
function getDesktopPath() {
  return path.join(os.homedir(), 'Desktop');
}

// Fungsi untuk setup direktori
function setupDirectories() {
  const desktopPath = getDesktopPath();
  const mainFolder = path.join(desktopPath, 'Purba Music');
  const spotifyOnlyFolder = path.join(mainFolder, 'Spotify Only');
  const spotifyYTFolder = path.join(mainFolder, 'Spotify x YouTube');

  createDirectoryIfNotExists(mainFolder);
  createDirectoryIfNotExists(spotifyOnlyFolder);
  createDirectoryIfNotExists(spotifyYTFolder);

  return { spotifyOnlyFolder, spotifyYTFolder };
}

async function downloadWithSpotdl(tracks) {
  const { spotifyOnlyFolder } = setupDirectories();
  
  try {
    console.log(chalk.cyan('\n⏳ MENDOWNLOAD LAGU...'));
    
    for (const track of tracks) {
      try {
        await new Promise((resolve, reject) => {
          const process = spawn('spotdl', [
            'download',
            track.url,
            '--output', spotifyOnlyFolder,
            '--format', 'mp3'
          ], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          process.stdout.on('data', (data) => {
            console.log(chalk.white(data.toString()));
          });

          process.stderr.on('data', (data) => {
            console.log(chalk.red(data.toString()));
          });

          process.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`spotdl exit dengan kode: ${code}`));
            }
          });
        });
      } catch (error) {
        console.error(chalk.red(`\n❌ Gagal download "${track.artis} - ${track.nama}":`, error.message));
      }
    }
  } catch (error) {
    throw new Error(`Error saat download: ${error.message}`);
  }
}

async function clearCache() {
  const cacheDirectories = [
    './cache',
    './.cache',
    './tmp',
    './.tmp',
    './downloads/cache'
  ];

  for (const dir of cacheDirectories) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(chalk.yellow(`🧹 Membersihkan cache: ${dir}`));
      } catch (error) {
        console.error(chalk.red(`Gagal membersihkan cache ${dir}:`, error.message));
      }
    }
  }
}

async function downloadAndConvert(youtubeUrl, outputFileName, format = 'mp3', maxRetries = 10) {
  const { spotifyYTFolder } = setupDirectories();
  const fullOutputPath = path.join(spotifyYTFolder, outputFileName);

  return new Promise(async (resolve, reject) => {
    let attemptCount = 0;
    
    const attemptDownload = async () => {
      attemptCount++;
      const tempFile = path.join(spotifyYTFolder, `temp_${Date.now()}.mp4`);
      
      console.log(`\nPercobaan download ke-${attemptCount}...`);
      
      try {
        const stream = ytdl(youtubeUrl, { 
          quality: format === 'mp3' ? 'highestaudio' : 'highest',
          filter: format === 'mp3' ? 'audioonly' : 'audioandvideo'
        });

        const writeStream = fs.createWriteStream(tempFile);
        stream.pipe(writeStream);

        await new Promise((resolveStream, rejectStream) => {
          writeStream.on('finish', resolveStream);
          writeStream.on('error', rejectStream);
          stream.on('error', rejectStream);
        });

        if (format === 'mp3') {
          await new Promise((resolveConvert, rejectConvert) => {
            ffmpeg(tempFile)
              .toFormat('mp3')
              .on('end', () => {
                fs.unlinkSync(tempFile);
                console.log(chalk.green(`✓ Berhasil mengkonversi ke MP3: ${outputFileName}`));
                resolveConvert();
              })
              .on('error', (err) => {
                if (fs.existsSync(tempFile)) {
                  fs.unlinkSync(tempFile);
                }
                rejectConvert(err);
              })
              .save(fullOutputPath);
          });
        } else {
          fs.renameSync(tempFile, fullOutputPath);
          console.log(chalk.green(`✓ Berhasil menyimpan MP4: ${outputFileName}`));
        }

        resolve();
      } catch (error) {
        console.error(chalk.red(`Gagal pada percobaan ke-${attemptCount}:`, error.message));
        
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }

        await clearCache();
        console.log(chalk.yellow('🧹 Cache dibersihkan'));

        if (attemptCount < maxRetries) {
          console.log(chalk.yellow('Menunggu sebelum mencoba lagi...'));
          await delay(5000);
          return attemptDownload();
        } else {
          reject(new Error(`Gagal setelah ${maxRetries} percobaan`));
        }
      }
    };

    await attemptDownload();
  });
}

async function spotifyYoutubeDownload(tracks, format) {
  for (const track of tracks) {
    try {
      console.log(chalk.cyan('\n🔍 MENCARI DI YOUTUBE:'), `${track.artis} - ${track.nama}`);
      const youtubeUrl = await searchYouTube(track.nama, track.artis);
      
      if (youtubeUrl) {
        const outputFileName = `${track.artis} - ${track.nama}.${format}`;
        await downloadAndConvert(youtubeUrl, outputFileName, format);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Gagal download: ${track.nama} -`, error.message));
    }
  }
}

function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printDivider() {
  console.log(chalk.gray('═'.repeat(50)));
}

async function selectDownloadMode() {
  printDivider();
  console.log(chalk.cyan('📋 PILIH MODE DOWNLOAD'));
  console.log(chalk.white('1. Spotify Only'));
  console.log(chalk.white('2. Spotify x YouTube'));
  
  return await getUserInput(chalk.yellow('\n➤ Pilih mode [ 1 / 2 ]: '));
}

async function selectCategory() {
  printDivider();
  console.log(chalk.cyan('📋 PILIH MODE PENCARIAN'));
  console.log(chalk.white('1. Random'));
  console.log(chalk.white('2. Kategori Custom'));
  
  const mode = await getUserInput(chalk.yellow('\n➤ Pilih mode [ 1 / 2 ]: '));
  
  if (mode === '1') {
    const randomCategories = ['Pop Indonesia', 'Rock Indonesia', 'Dangdut Hits', 'Indo Hits'];
    const category = randomCategories[Math.floor(Math.random() * randomCategories.length)];
    console.log(chalk.green('\n➤ KATEGORI RANDOM:'), category);
    return category;
  } else {
    printDivider();
    console.log(chalk.cyan('📋 PILIH KATEGORI'));
    console.log(chalk.white('1. Tiktok'));
    console.log(chalk.white('2. Pop Indonesia'));
    console.log(chalk.white('3. Rock Indonesia'));
    console.log(chalk.white('4. Dangdut'));
    console.log(chalk.white('5. Custom Search'));
    
    const category = await getUserInput(chalk.yellow('\n➤ Pilih kategori [1-5]: '));
    
    switch(category) {
      case '1': return 'Tiktok';
      case '2': return 'Pop Indonesia';
      case '3': return 'Rock Indonesia';
      case '4': return 'Dangdut';
      case '5': return await getUserInput(chalk.yellow('➤ Masukkan kata kunci pencarian: '));
      default: return 'Tiktok';
    }
  }
}

async function selectDownloadQuantity() {
  printDivider();
  console.log(chalk.cyan('📋 JUMLAH DOWNLOAD'));
  console.log(chalk.white('1. Unlimited'));
  console.log(chalk.white('2. Custom Jumlah'));
  
  const mode = await getUserInput(chalk.yellow('\n➤ Pilih mode [ 1 / 2 ]: '));
  
  if (mode === '1') {
    console.log(chalk.green('\n➤ MODE: UNLIMITED DOWNLOAD'));
    return Infinity;
  } else {
    const num = parseInt(await getUserInput(chalk.yellow('➤ Masukkan jumlah lagu: ')));
    console.log(chalk.green(`\n➤ MODE: DOWNLOAD ${num} LAGU`));
    return num;
  }
}

async function selectOutputFormat() {
  printDivider();
  console.log(chalk.cyan('📋 FORMAT OUTPUT'));
  console.log(chalk.white('1. MP3'));
  console.log(chalk.white('2. MP4'));
  
  const format = await getUserInput(chalk.yellow('\n➤ Pilih format [ 1 / 2 ]: '));
  return format === '1' ? 'mp3' : 'mp4';
}

async function main() {
  console.clear();
  console.log(chalk.yellow(LOGO));
  console.log(chalk.gray(`Started at: ${new Date().toLocaleString()}`));
  
  // Cek koneksi dan proxy
  await checkProxyStatus();
  
  // Pilih mode download
  const downloadMode = await selectDownloadMode();
  
  // Pilih kategori
  const category = await selectCategory();
  
  // Pilih jumlah (unlimited/custom)
  const quantity = await selectDownloadQuantity();
  
  // Cari tracks di Spotify
  const tracks = await searchTracks(category);
  
  if (tracks && tracks.length > 0) {
    // Pilih tracks sesuai quantity
    const selectedTracks = quantity === Infinity ? 
      tracks : 
      tracks.slice(0, Math.min(quantity, tracks.length));
    
    console.log(chalk.cyan('\n📥 LAGU YANG AKAN DIDOWNLOAD:'));
    selectedTracks.forEach((track, index) => {
      console.log(chalk.white(`${index + 1}. ${track.artis} - ${track.nama}`));
    });

    if (downloadMode === '1') {
      // Spotify Only dengan spotdl
      console.log(chalk.cyan('\n⏳ DOWNLOADING DENGAN SPOTDL...'));
      await downloadWithSpotdl(selectedTracks);
    } else {
      // Spotify x YouTube
      const format = await selectOutputFormat();
      console.log(chalk.cyan('\n⏳ DOWNLOADING DENGAN YOUTUBE...'));
      await spotifyYoutubeDownload(selectedTracks, format);
    }
    console.log(chalk.green('\n✅ Download selesai!'));
  } else {
    console.log(chalk.red('\n❌ Tidak ada hasil ditemukan.'));
  }
}

main().catch(error => {
  console.error(chalk.red('\n❌ Error:', error.message));
  process.exit(1);
});