/* SPDX-License-Identifier: GPL-3.0-or-later */

// Native React Native dialog. The backdrop, fields and footer follow Discord's
// Add Account design; the narrow, scrollable card also fits phone keyboards.
export function createLoginDialog(React, RN) {
    const h = React.createElement;
    const QrBoundary = typeof React.Component === 'function' ? class QrViewBoundary extends React.Component {
        state = { failed: false };
        static getDerivedStateFromError() { return { failed: true }; }
        componentDidCatch() { this.props.onError?.(); }
        render() { return this.state.failed ? null : this.props.children; }
    } : ({ children }) => children;
    return function LoginDialog({ visible, mfa = false, qrMode = false, qrContent, qrKey, onQrRenderError, onQrLogin, onRefreshQr, light = false, busy = false,
        login, password, code, error, onLoginChange, onPasswordChange, onCodeChange,
        onSubmit, onClose, onBack, onForgotPassword, onNativeLogin }) {
        if (!visible) return null;
        const c = light
            ? { card: '#ffffff', field: '#f2f3f5', border: '#d3d5da', text: '#1e1f22', muted: '#5c5e66', link: '#4752c4', danger: '#c32943', footer: '#f2f3f5' }
            : { card: '#242429', field: '#1f1f24', border: '#3a3a42', text: '#f2f3f5', muted: '#b5b5bd', link: '#8991ff', danger: '#ffb0b9', footer: '#202025' };
        const ready = !busy && (qrMode || (mfa ? !!code.trim() : !!login.trim() && password.length > 0));
        const submit = () => { if (ready) { if (qrMode) onRefreshQr(); else onSubmit(); } };
        const text = (value, style = {}, extra = {}) => h(RN.Text, { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...extra }, value);
        const link = (title, action, style = {}) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, onPress: action,
            disabled: busy, style: { minHeight: 44, justifyContent: 'center', opacity: busy ? 0.5 : 1, ...style }
        }, text(title, { color: c.link, fontSize: 14 }));
        const field = (label, value, onChangeText, props) => h(RN.View, { style: { marginBottom: 18 } },
            h(RN.Text, { style: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 9 } },
                label, h(RN.Text, { style: { color: '#ed4245' } }, ' *')),
            h(RN.TextInput, { value, onChangeText, editable: !busy, accessibilityLabel: label,
                autoCapitalize: 'none', autoCorrect: false, selectionColor: '#8991ff',
                style: { minHeight: 48, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 11,
                    backgroundColor: c.field, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: 16 }, ...props }));
        const title = mfa ? 'Two-Factor Authentication' : 'Welcome back!';
        const subtitle = mfa ? 'Enter an authenticator code or an unused backup code to finish signing in.'
            : 'We’re so excited to see you again! Sign in to another account to switch between profiles.';
        const wide = (RN.useWindowDimensions?.().width || 390) >= 680;
        // Discord web-login inspired arrangement. QR is presented only after an
        // explicit action; never display a fabricated or reused authentication QR.
        const emailPane = h(RN.View, { style: { flex: 1, minWidth: 0, paddingRight: wide ? 18 : 0 } },
            field('Email or Phone Number', login, onLoginChange, { autoComplete: 'username', keyboardType: 'email-address', textContentType: 'username' }),
            field('Password', password, onPasswordChange, { secureTextEntry: true, autoComplete: 'password', textContentType: 'password', returnKeyType: 'go', onSubmitEditing: onSubmit }),
            link('Forgot your password?', onForgotPassword, { marginTop: -14 }),
            qrMode ? h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Log In',
                accessibilityState: { disabled: busy || !login.trim() || !password.length },
                disabled: busy || !login.trim() || !password.length, onPress: onSubmit,
                style: { marginTop: 12, paddingVertical: 12, borderRadius: 6, backgroundColor: '#5865f2',
                    opacity: busy || !login.trim() || !password.length ? 0.5 : 1 } },
                text('Log In', { textAlign: 'center', color: '#fff', fontWeight: '700' })) : null,
            text('Passwords and verification codes are never saved.', { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }));
        const qrPane = h(RN.View, { style: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center',
            paddingLeft: wide ? 18 : 0, paddingTop: wide ? 0 : 12,
            borderLeftWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: c.border } },
            qrMode && qrContent ? h(QrBoundary, { key: qrKey, onError: onQrRenderError }, qrContent)
                : h(RN.View, { accessibilityLabel: 'QR code not generated', style: { width: 188, height: 188, borderRadius: 8,
                    backgroundColor: light ? '#f2f3f5' : '#313238', alignItems: 'center', justifyContent: 'center', padding: 15 } },
                    text('QR CODE', { color: c.muted, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' }),
                    text('Generate a fresh code', { color: c.muted, fontSize: 12, textAlign: 'center' })),
            text('Log in with QR Code', { textAlign: 'center', fontWeight: '700', fontSize: 18, marginTop: 16, marginBottom: 0 }),
            text('Scan with the Discord mobile app on another signed-in device, then approve the login.',
                { textAlign: 'center', color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }),
            link(qrMode ? 'Refresh QR code' : 'Log in with QR Code', qrMode ? onRefreshQr : onQrLogin,
                { alignItems: 'center', marginTop: 3 }));
        const signInBody = h(RN.View, { style: { flexDirection: wide ? 'row' : 'column', alignItems: 'stretch' } },
            ...(wide ? [emailPane, qrPane] : [qrPane, emailPane]));
        return h(RN.Modal, { visible: true, transparent: true, animationType: 'fade',
            presentationStyle: 'overFullScreen', onRequestClose: onClose, statusBarTranslucent: true },
            h(RN.KeyboardAvoidingView, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : 'height' },
                h(RN.View, { style: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 } },
                    h(RN.View, { accessibilityViewIsModal: true, style: { width: '100%', maxWidth: 820, maxHeight: '90%',
                        backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' } },
                        h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag', bounces: false,
                            style: { flexShrink: 1 }, contentContainerStyle: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 } },
                            h(RN.View, { style: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' } },
                                h(RN.View, { style: { flex: 1, paddingRight: 8, paddingTop: 2 } },
                                    text(title, { fontSize: 24, lineHeight: 30, fontWeight: '700' }, { accessibilityRole: 'header' })),
                                h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Close add account', onPress: onClose,
                                    style: { width: 44, height: 44, marginTop: -9, marginRight: -11, alignItems: 'center', justifyContent: 'center' } },
                                    text('×', { color: c.muted, fontSize: 32, lineHeight: 36, fontWeight: '300' }))),
                            text(subtitle, { color: c.muted, marginTop: 4, marginBottom: 28 }),
                            error ? text(error, { color: c.danger, marginBottom: 18 }, { accessibilityRole: 'alert', accessibilityLiveRegion: 'polite' }) : null,
                            mfa ? field('Verification Code', code, onCodeChange,
                                { secureTextEntry: true, autoComplete: 'one-time-code', returnKeyType: 'done', onSubmitEditing: submit })
                                : signInBody,
                            link('Use Discord’s normal sign-in', onNativeLogin),
                            text('Only approve QR logins you started yourself.', { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 4, marginBottom: 6 })),
                        h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: c.footer, paddingHorizontal: 22, paddingVertical: 16 } },
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Back', onPress: onBack,
                                style: { minHeight: 44, minWidth: 60, justifyContent: 'center', paddingRight: 16 } },
                                text('Back', { fontWeight: '600' })),
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: qrMode ? 'Refresh QR code' : mfa ? 'Verify' : 'Continue',
                                accessibilityState: { disabled: !ready, busy }, disabled: !ready, onPress: submit,
                                style: { backgroundColor: '#5865f2', opacity: ready || busy ? 1 : 0.5, borderRadius: 7,
                                    minHeight: 44, minWidth: 112, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' } },
                                busy ? h(RN.ActivityIndicator, { color: '#ffffff', size: 'small', accessibilityLabel: 'Signing in' })
                                    : text(qrMode ? 'Refresh QR code' : mfa ? 'Verify' : 'Continue', { color: '#ffffff', fontWeight: '600' })))))));
    };
}
