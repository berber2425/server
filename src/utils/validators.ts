export function validateEmail(email: string) {
  return email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

export function validatePassword(password: string) {
  return password.match(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/);
}

// +905321234567
// +12121234567
// Global phone number format without spaces
export function validatePhoneNumber(phoneNumber: string) {
  return phoneNumber.match(/^\+[0-9]{10,15}$/);
}

export function validateColor(color: string) {
  return color.match(/^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$/);
}
