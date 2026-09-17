function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Shuffle display positions, keeping the original answer IDs for server grading.
// Spread correct answers across all four positions so an attempt never favors one.
export function quizChoiceOrder(items, random = Math.random) {
  const positions = shuffled([0, 1, 2, 3], random);
  const correctPositions = shuffled(items.map((_, index) => positions[index % 4]), random);
  return items.map((item, index) => {
    const order = shuffled(item.choices.map((_, choice) => choice).filter(choice => choice !== item.answer), random);
    order.splice(correctPositions[index], 0, item.answer);
    return order;
  });
}
