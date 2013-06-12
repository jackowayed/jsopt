function c() {
  try {
    throw "some error";
  } catch (e) {
    error = e;
  }
  return null;
}

try {
  var katniss = "Hunger games";
} catch (e) {
  console.log("again");
}

c();