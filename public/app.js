const uploadForm = document.querySelector("#upload-form");
const photoNameInput = document.querySelector("#photo-name");
const uploadedByInput = document.querySelector("#uploaded-by");
const photoFileInput = document.querySelector("#photo-file");
const uploadStatus = document.querySelector("#upload-status");
const nextPairButton = document.querySelector("#next-pair");
const battleEmpty = document.querySelector("#battle-empty");
const battleCards = document.querySelector("#battle-cards");
const leftCard = document.querySelector("#left-card");
const rightCard = document.querySelector("#right-card");
const roundResult = document.querySelector("#round-result");
const uploaderLeaderboard = document.querySelector("#uploader-leaderboard");

let photos = [];
let currentPair = [];
let roundLocked = false;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "couldnt upload idk why");
  }

  return data;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("couldnt read it idk why."));
    reader.readAsDataURL(file);
  });
}

function pickPair() {
  if (photos.length < 2) {
    currentPair = [];
    return;
  }

  const firstIndex = Math.floor(Math.random() * photos.length);
  let secondIndex = Math.floor(Math.random() * photos.length);

  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * photos.length);
  }

  currentPair = [photos[firstIndex], photos[secondIndex]];
  roundLocked = false;
}

function renderCard(card, photo) {
  card.innerHTML = "";
  card.disabled = roundLocked;

  const image = document.createElement("img");
  image.src = photo.image;
  image.alt = photo.name;

  const caption = document.createElement("span");
  const title = document.createElement("strong");
  const uploader = document.createElement("small");

  title.textContent = photo.name;
  uploader.textContent = `Uploaded by ${photo.uploadedBy || "Anonymous"}`;
  caption.append(title, uploader);
  card.append(image, caption);
}

function renderBattle() {
  if (!battleEmpty || !battleCards) {
    return;
  }

  if (photos.length < 2) {
    battleEmpty.hidden = false;
    battleCards.hidden = true;
    nextPairButton.disabled = true;
    roundResult.hidden = true;
    return;
  }

  if (currentPair.length < 2) {
    pickPair();
  }

  battleEmpty.hidden = true;
  battleCards.hidden = false;
  nextPairButton.disabled = false;
  renderCard(leftCard, currentPair[0]);
  renderCard(rightCard, currentPair[1]);
}

function renderLeaderboard() {
  if (!uploaderLeaderboard) {
    return;
  }

  const people = {};

  for (const photo of photos) {
    const name = photo.uploadedBy || "Anonymous";

    if (!people[name]) {
      people[name] = {
        name,
        wins: 0,
        losses: 0,
        photos: 0
      };
    }

    people[name].wins += photo.wins;
    people[name].losses += photo.losses;
    people[name].photos += 1;
  }

  const ranked = Object.values(people).sort((a, b) => {
    const aTotal = a.wins + a.losses;
    const bTotal = b.wins + b.losses;
    let aPercent = 0;
    let bPercent = 0;

    if (aTotal > 0) {
      aPercent = a.wins / aTotal;
    }

    if (bTotal > 0) {
      bPercent = b.wins / bTotal;
    }

    return bPercent - aPercent;
  });

  uploaderLeaderboard.innerHTML = "";

  if (!ranked.length) {
    const item = document.createElement("li");
    item.textContent = "no uploads yet";
    uploaderLeaderboard.append(item);
    return;
  }

  for (const person of ranked) {
    const total = person.wins + person.losses;
    let percent = 0;

    if (total > 0) {
      percent = Math.round((person.wins / total) * 100);
    }

    const item = document.createElement("li");
    const name = document.createElement("strong");
    const stats = document.createElement("span");

    name.textContent = person.name;
    stats.textContent = `${percent}% win rate // ${person.wins}-${person.losses}   //   ${person.photos} photos`;
    item.append(name, stats);
    uploaderLeaderboard.append(item);
  }
}

function showResult(winner, loser) {
  const total = winner.wins + winner.losses;
  const winRate = total ? Math.round((winner.wins / total) * 100) : 0;
  roundResult.replaceChildren();
  const title = document.createElement("strong");
  const stats = document.createElement("span");
  title.textContent = `${winner.name} wins this matchup!!`;
  stats.textContent = `${winRate}% win rate   //   ${loser.name} is now ${loser.wins}-${loser.losses}`;
  roundResult.append(title, stats);
  roundResult.hidden = false;
}

async function loadPhotos() {
  const data = await api("/api/photos");
  photos = data.photos;
  renderBattle();
  renderLeaderboard();
}

async function showNextPair() {
  if (!battleCards || battleCards.hidden) {
    renderBattle();
    return;
  }

  battleCards.classList.remove("fade-out");
  battleCards.classList.add("fade-out");
  await wait(350);
  renderBattle();
  battleCards.offsetHeight;
  battleCards.classList.remove("fade-out");
  battleCards.classList.add("fade-in");
  await wait(350);
  battleCards.classList.remove("fade-in");
}

async function submitVote(winner, loser) {
  if (roundLocked) {
    return;
  }

  roundLocked = true;
  try {
    const data = await api("/api/vote", {
      method: "POST",
      body: JSON.stringify({ winnerId: winner.id, loserId: loser.id })
    });

    let updatedWinner = data.winner;
    let updatedLoser = data.loser;

    if (data.photos) {
      photos = data.photos;
      updatedWinner = photos.find((photo) => photo.id === winner.id);
      updatedLoser = photos.find((photo) => photo.id === loser.id);
    } else {
      photos = photos.map((photo) => {
        if (updatedWinner && photo.id === updatedWinner.id) {
          return updatedWinner;
        }

        if (updatedLoser && photo.id === updatedLoser.id) {
          return updatedLoser;
        }

        return photo;
      });
    }

    if (!updatedWinner || !updatedLoser) {
      throw new Error("vote didnt go through");
    }

    currentPair = [updatedWinner, updatedLoser];
    renderBattle();
    renderLeaderboard();
    showResult(updatedWinner, updatedLoser);
  } catch (error) {
    roundLocked = false;

    if (roundResult) {
      roundResult.innerHTML = "";
      const text = document.createElement("span");
      text.textContent = "vote didnt go through";
      roundResult.append(text);
      roundResult.hidden = false;
    }
  }
}

if (uploadForm) {
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    uploadStatus.textContent = "";

    const files = Array.from(photoFileInput.files);
    if (!files.length) {
      uploadStatus.textContent = "Choose pictures first.";
      return;
    }

    try {
      uploadStatus.textContent = "uploading...";

      for (let index = 0; index < files.length; index += 1) {
        const image = await readImageFile(files[index]);
        let photoName = photoNameInput.value;

        if (files.length > 1) {
          photoName = `${photoNameInput.value} ${index + 1}`;
        }

        await api("/api/photos", {
          method: "POST",
          body: JSON.stringify({
            name: photoName,
            uploadedBy: uploadedByInput.value,
            image
          })
        });
      }

      uploadForm.reset();
      uploadStatus.textContent = "done";
    } catch (error) {
      uploadStatus.textContent = "couldnt upload idk why";
    }
  });
}

if (nextPairButton) {
  nextPairButton.addEventListener("click", async () => {
    pickPair();
    if (roundResult) {
      roundResult.hidden = true;
    }
    await showNextPair();
  });
}

if (leftCard) {
  leftCard.addEventListener("click", () => {
    if (currentPair.length === 2) {
      submitVote(currentPair[0], currentPair[1]);
    }
  });
}

if (rightCard) {
  rightCard.addEventListener("click", () => {
    if (currentPair.length === 2) {
      submitVote(currentPair[1], currentPair[0]);
    }
  });
}

loadPhotos().catch((error) => {
  if (uploadStatus) {
    uploadStatus.textContent = error.message;
  }
  if (battleEmpty) {
    battleEmpty.textContent = error.message;
  }
});
