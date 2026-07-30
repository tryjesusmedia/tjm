(() => {
  "use strict";

  const journeys = {
    jesus: {
      name: "Get to Know Jesus",
      lessons: [
        {
          id: 2,
          title: "If God Is Good, Why Is There So Much Evil?",
          description:
            "Why would a loving, all-powerful God allow suffering? Explore the origin of evil, the meaning of human freedom, and what the cross reveals about God’s response to pain."
        },
        {
          id: 3,
          title: "The Problem Success Cannot Solve",
          description:
            "Beneath conflict, addiction, injustice, shame, and broken relationships lies a deeper spiritual problem. Discover how humanity became separated from God—and the solution Jesus offers every person."
        },
        {
          id: 5,
          title:
            "The Greatest Scam in History: The Lie That Distorted God’s Character",
          description:
            "God’s law has been misunderstood and turned into a system of fear, control, and human effort. Discover how His law actually reveals His love, character, and design for freedom—and why understanding it changes how we see God."
        },
        {
          id: 9,
          title: "The Sanctuary: God’s Blueprint of Salvation",
          description:
            "The ancient sanctuary was more than a tent or system of ceremonies. Every sacrifice, priest, furnishing, and service revealed another part of God’s plan to save humanity through Jesus."
        },
        {
          id: 10,
          title: "The Sanctuary Revealed: What Jesus Is Doing Now",
          description:
            "The sanctuary story did not end when the earthly temple disappeared. Discover how its symbols point to Christ’s continuing ministry and what His work means for believers today."
        },
        {
          id: 11,
          title: "The Day of Atonement: When Mercy Meets Judgment",
          description:
            "Why was one day considered the most solemn day of Israel’s year? Explore how the Day of Atonement reveals cleansing, accountability, forgiveness, judgment, and the ministry of Jesus."
        },
        {
          id: 12,
          title: "What Really Happens When You Die?",
          description:
            "Do people immediately enter heaven or hell? Can the dead see or communicate with the living? Set tradition aside and examine what the Bible consistently teaches about death and resurrection."
        },
        {
          id: 13,
          title: "Is Hell Eternal? The Truth About the Consuming Fire",
          description:
            "Does a loving God torment people forever, or has hell been misunderstood? Explore the Bible’s language of fire, destruction, justice, and the ultimate end of evil."
        },
        {
          id: 14,
          title: "The 1,000 Years: What Happens After Jesus Returns?",
          description:
            "Where are the saved, the lost, and Satan during the Millennium? Follow the biblical sequence of events and discover what happens before God creates a world without suffering."
        },
        {
          id: 15,
          title: "Wax On, Wax Off: The Secret of True Worship",
          description:
            "What can The Karate Kid teach us about worship? Discover how repeated choices shape character—and why worship is expressed through far more than songs, sermons, or time spent in church."
        }
      ]
    },

    prophecy: {
      name: "Understand Bible Prophecy",
      lessons: [
        {
          id: 1,
          title: "Can the Bible Really Predict the Future?",
          description:
            "Put the Bible’s credibility to the test through Daniel 2—an ancient prophecy that traces the rise and fall of world empires and points toward the kingdom God has promised to establish."
        },
        {
          id: 4,
          title: "The Prophecy That Pinpointed the Messiah",
          description:
            "Centuries before Jesus was born, the Bible revealed when the Messiah would appear. Follow the remarkable timeline of Daniel 9 and examine the evidence that points directly to Christ."
        },
        {
          id: 5,
          title:
            "The Greatest Scam in History: The Lie That Distorted God’s Character",
          description:
            "God’s law has been misunderstood and turned into a system of fear, control, and human effort. Discover how His law actually reveals His love, character, and design for freedom—and why understanding it changes how we see God."
        },
        {
          id: 6,
          title: "Who Is the Antichrist? Follow the Biblical Clues",
          description:
            "Move beyond sensational headlines, political theories, and speculation. Examine the identifying characteristics found in Daniel and Revelation and allow the Bible to interpret its own symbols."
        },
        {
          id: 7,
          title: "The Seal of God vs. the Mark of the Beast",
          description:
            "The final conflict is about far more than technology, economics, or an outward symbol. Discover what the Bible reveals about worship, authority, allegiance, and the choice every person must make."
        },
        {
          id: 8,
          title: "Does the Bible Predict the Rise of America?",
          description:
            "Revelation describes a powerful nation emerging during a pivotal moment in history. Examine the prophetic clues, America’s possible role in last-day events, and why religious liberty matters."
        },
        {
          id: 16,
          title: "One Bible. Why So Many Churches?",
          description:
            "Jesus prayed for unity, yet Christianity became divided into countless traditions and denominations. Trace how that division developed and discover how to evaluate beliefs through Scripture."
        },
        {
          id: 17,
          title: "How Can You Recognize God’s Church Today?",
          description:
            "Rather than beginning with a denomination or religious label, begin with the Bible. Explore the characteristics Scripture gives for identifying God’s faithful people in the last days."
        },
        {
          id: 18,
          title: "Does the Bible Predict a Last-Day Prophet?",
          description:
            "Throughout Scripture, God repeatedly sent a messenger before major moments of judgment, deliverance, and spiritual renewal. Examine that pattern and learn the biblical tests of a genuine prophet."
        }
      ]
    }
  };

  const pathMatch = window.location.pathname.match(
    /\/lesson(\d+)(?:\/|\/index\.html)?$/i
  );

  if (!pathMatch) return;

  const currentLessonId = Number.parseInt(pathMatch[1], 10);

  const memberships = Object.keys(journeys).filter((journeyKey) =>
    journeys[journeyKey].lessons.some(
      (lesson) => lesson.id === currentLessonId
    )
  );

  if (!memberships.length) return;

  const searchParams = new URLSearchParams(window.location.search);
  const requestedJourney = searchParams.get("journey");
  const savedJourney = window.sessionStorage.getItem(
    "tjm-active-journey"
  );

  let journeyKey;

  if (memberships.includes(requestedJourney)) {
    journeyKey = requestedJourney;
  } else if (memberships.includes(savedJourney)) {
    journeyKey = savedJourney;
  } else if (memberships.length === 1) {
    journeyKey = memberships[0];
  } else {
    // Lesson 5 belongs to both journeys.
    // Direct visits default to Get to Know Jesus.
    journeyKey = "jesus";
  }

  const journey = journeys[journeyKey];
  const currentIndex = journey.lessons.findIndex(
    (lesson) => lesson.id === currentLessonId
  );

  if (currentIndex < 0) return;

  const currentPosition = currentIndex + 1;
  const totalGuides = journey.lessons.length;
  const nextGuide = journey.lessons[currentIndex + 1];

  window.sessionStorage.setItem("tjm-active-journey", journeyKey);

  /*
   * Keep the journey visible in the URL.
   * This is especially important for the shared Lesson 5.
   */
  if (searchParams.get("journey") !== journeyKey) {
    const updatedUrl = new URL(window.location.href);
    updatedUrl.searchParams.set("journey", journeyKey);

    window.history.replaceState(
      {},
      "",
      `${updatedUrl.pathname}${updatedUrl.search}${updatedUrl.hash}`
    );
  }

  const journeyEyebrow = document.getElementById("journeyEyebrow");

  if (journeyEyebrow) {
    journeyEyebrow.textContent =
      `${journey.name} · Guide ${currentPosition} of ${totalGuides}`;
  }

  const nextButton = document.getElementById("journeyNextButton");
  const nextCard = document.getElementById("nextJourneyCard");
  const nextLabel = document.getElementById("nextJourneyLabel");
  const nextTitle = document.getElementById("nextJourneyTitle");
  const nextDescription = document.getElementById(
    "nextJourneyDescription"
  );

  if (nextGuide) {
    const nextPosition = currentPosition + 1;
    const nextUrl =
      `/lesson${nextGuide.id}/?journey=${encodeURIComponent(journeyKey)}`;

    if (nextButton) {
      nextButton.href = nextUrl;
      nextButton.innerHTML =
        `Continue to Guide ${nextPosition} ` +
        `<span aria-hidden="true">→</span>`;
    }

    if (nextLabel) {
      nextLabel.textContent =
        `NEXT GUIDE · ${journey.name.toUpperCase()} · ` +
        `${nextPosition} OF ${totalGuides}`;
    }

    if (nextTitle) {
      nextTitle.textContent = nextGuide.title;
    }

    if (nextDescription) {
      nextDescription.textContent = nextGuide.description;
    }
  } else {
    if (nextButton) {
      nextButton.href = "/welcome/#lessons";
      nextButton.innerHTML =
        `Journey Complete · View Both Journeys ` +
        `<span aria-hidden="true">→</span>`;
    }

    if (nextLabel) {
      nextLabel.textContent = "JOURNEY COMPLETE";
    }

    if (nextTitle) {
      nextTitle.textContent = `You completed ${journey.name}`;
    }

    if (nextDescription) {
      nextDescription.textContent =
        "Return to the guide library to revisit this journey or begin the other path.";
    }

    if (nextCard) {
      nextCard.classList.add("journey-complete-card");
    }
  }
})();
