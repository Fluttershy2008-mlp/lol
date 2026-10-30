/* SPDX-License-Identifier: GPL-3.0-or-later */

// Small native login dialog with no QR login or embedded web browser.
// The account manager, login flow, and two-factor verification remain intact.
export function createLoginDialog(React, RN) {
    const h = React.createElement;
    return function LoginDialog({ visible, mfa = false, light = false, busy = false, reauthUsername,
        login, password, code, error, onLoginChange, onPasswordChange, onCodeChange,
        verification, onSendSms, onUseSms, onUseAlternative,
        onSubmit, onClose, onBack, onForgotPassword, onNativeLogin }) {
        if (!visible) return null;
        const c = light
            ? { card: '#ffffff', field: '#f2f3f5', border: '#d3d5da', text: '#1e1f22', muted: '#5c5e66', link: '#4752c4', danger: '#c32943', footer: '#f2f3f5' }
            : { card: '#242429', field: '#1f1f24', border: '#3a3a42', text: '#f2f3f5', muted: '#b5b5bd', link: '#8991ff', danger: '#ffb0b9', footer: '#202025' };
        const sms = mfa && verification?.method === 'sms';
        const ready = !busy && (mfa ? !!code.trim() && (!sms || verification.smsSent) : !!login.trim() && !!password.length);
        const submit = () => { if (ready) onSubmit(); };
        const text = (value, style = {}, extra = {}) => h(RN.Text,
            { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...extra }, value);
        const link = (title, action, disabled = false) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, onPress: action,
            disabled: busy || disabled, accessibilityState: { disabled: busy || disabled },
            style: { minHeight: 44, justifyContent: 'center', opacity: busy || disabled ? 0.5 : 1 }
        }, text(title, { color: c.link, fontSize: 14 }));
        const field = (label, value, onChangeText, props) => h(RN.View, { style: { marginBottom: 16 } },
            text(label, { fontWeight: '600', marginBottom: 6 }),
            h(RN.TextInput, { value, onChangeText, editable: !busy, accessibilityLabel: label,
                autoCapitalize: 'none', autoCorrect: false, selectionColor: '#8991ff',
                style: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                    color: c.text, backgroundColor: c.field, borderWidth: 1, borderColor: c.border, borderRadius: 8 },
                ...props }));
        return h(RN.Modal, { visible: true, transparent: true, animationType: 'fade',
            presentationStyle: 'overFullScreen', onRequestClose: onClose, statusBarTranslucent: true },
            h(RN.KeyboardAvoidingView, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : 'height' },
                h(RN.View, { style: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
                    alignItems: 'center', justifyContent: 'center', padding: 16 } },
                    h(RN.View, { accessibilityViewIsModal: true,
                        style: { width: '100%', maxWidth: 480, maxHeight: '90%',
                            backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: 'hidden' } },
                        h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', bounces: false,
                            style: { flexShrink: 1 },
                            contentContainerStyle: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 12 } },
                            h(RN.View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
                                text(mfa ? 'Two-Factor Authentication' : reauthUsername ? 'Update saved account' : 'Add Account',
                                    { fontSize: 22, lineHeight: 28, fontWeight: '700' },
                                    { accessibilityRole: 'header' }),
                                h(RN.TouchableOpacity, { accessibilityRole: 'button',
                                    accessibilityLabel: 'Close add account', onPress: onClose,
                                    style: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } },
                                    text('×', { color: c.muted, fontSize: 30, lineHeight: 32 }))),
                            text(mfa ? sms
                                ? verification.smsSent ? `Enter the SMS code Discord sent to ${verification.phone}.`
                                    : 'Send a code to the phone number linked to this Discord account.'
                                : verification?.method === 'backup' ? 'Enter an unused backup code to finish signing in.'
                                    : 'Enter your authenticator or backup code to finish signing in.'
                                : reauthUsername ? `Sign in to @${reauthUsername} using its email or phone number and password. Only that account will be updated.`
                                : 'Sign in to save another account and switch between profiles.',
                                { color: c.muted, marginTop: 4, marginBottom: 20 }),
                            error ? text(error, { color: c.danger, marginBottom: 16 },
                                { accessibilityRole: 'alert', accessibilityLiveRegion: 'polite' }) : null,
                            mfa ? field(sms ? 'SMS Code' : 'Verification Code', code, onCodeChange,
                                { secureTextEntry: true, autoComplete: 'one-time-code',
                                    keyboardType: sms ? 'number-pad' : 'default', textContentType: 'oneTimeCode',
                                    returnKeyType: 'done', onSubmitEditing: submit })
                                : h(RN.View, null,
                                    field('Email or Phone Number', login, onLoginChange,
                                        { autoComplete: 'username', keyboardType: 'email-address', textContentType: 'username' }),
                                    field('Password', password, onPasswordChange,
                                        { secureTextEntry: true, autoComplete: 'password',
                                            textContentType: 'password', returnKeyType: 'go', onSubmitEditing: submit }),
                                    link('Forgot your password?', onForgotPassword)),
                            mfa && verification?.smsAvailable ? h(RN.View, null,
                                sms || !verification.smsSent
                                    ? link(verification.smsSent ? 'Resend SMS code' : 'Send SMS code', onSendSms, verification.resendAfter > 0)
                                    : link('Use SMS code', onUseSms),
                                verification.resendAfter > 0 ? text(`You can request another SMS in ${verification.resendAfter}s.`,
                                    { color: c.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 }) : null,
                                sms && verification.alternative ? link(verification.alternative === 'backup' ? 'Use backup code' : 'Use authenticator or backup code', onUseAlternative) : null)
                                : mfa ? text('SMS authentication is not enabled for this account. Enable it in Discord’s account settings while signed in to use SMS here.',
                                    { color: c.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }) : null,
                            link('Use Discord’s normal sign-in', onNativeLogin),
                            text('Passwords and verification codes are never saved.',
                                { color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 8 })),
                        h(RN.View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            backgroundColor: c.footer, paddingHorizontal: 22, paddingVertical: 16 } },
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Back',
                                onPress: onBack, style: { minHeight: 44, minWidth: 68, justifyContent: 'center' } },
                                text('Back', { fontWeight: '600' })),
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: mfa ? 'Verify' : 'Continue',
                                accessibilityState: { disabled: !ready, busy }, disabled: !ready, onPress: submit,
                                style: { minHeight: 44, minWidth: 112, borderRadius: 8, alignItems: 'center',
                                    justifyContent: 'center', backgroundColor: '#5865f2', opacity: ready ? 1 : 0.5 } },
                                busy ? h(RN.ActivityIndicator, { color: '#ffffff', size: 'small', accessibilityLabel: 'Signing in' })
                                    : text(mfa ? 'Verify' : 'Continue', { color: '#ffffff', fontWeight: '700' })))))));
    };
}
