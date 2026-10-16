package com.drawrush.app.di

import com.google.firebase.auth.FirebaseAuth
import com.drawrush.app.data.network.SocketManager
import com.drawrush.app.data.repository.GameRepository
import com.drawrush.app.data.preferences.UserPreferencesRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()

    @Provides
    @Singleton
    fun provideSocketManager(): SocketManager = SocketManager()
}
