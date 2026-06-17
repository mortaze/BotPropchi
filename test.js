import bcrypt from "bcrypt";

const password = "mori82";
const hash = await bcrypt.hash(password, 10);

console.log(hash);