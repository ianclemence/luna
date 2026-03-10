import * as Device from 'expo-device';
import { Alert, Platform } from 'react-native';

async function loadNotifications() {
    try {
        const mod = await import('expo-notifications');
        return mod;
    } catch (e) {
        return null;
    }
}

export async function registerForPushNotificationsAsync() {
    let token;

    const Notifications = await loadNotifications();
    if (!Notifications) {
        return token;
    }

    await Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            return;
        }
    }

    return token;
}
