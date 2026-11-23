// Shared by account creation, password changes/resets and their forms.
// Login verifies existing hashes without retroactively applying the new rules.
export const PASSWORD_MIN_LENGTH=8;
export const PASSWORD_MAX_LENGTH=200;
export const PASSWORD_HELP='Entre 8 y 200 caracteres, con al menos un número, una mayúscula, una minúscula y un símbolo.';
export const PASSWORD_PATTERN='(?=[\\s\\S]*[0-9])(?=[\\s\\S]*\\p{Lu})(?=[\\s\\S]*\\p{Ll})(?=[\\s\\S]*[\\p{P}\\p{S}])[\\s\\S]{8,200}';
export function passwordPolicyError(value){
  return typeof value==='string'&&value.length>=PASSWORD_MIN_LENGTH&&value.length<=PASSWORD_MAX_LENGTH&&/[0-9]/u.test(value)&&/\p{Lu}/u.test(value)&&/\p{Ll}/u.test(value)&&/[\p{P}\p{S}]/u.test(value)?'':PASSWORD_HELP;
}
