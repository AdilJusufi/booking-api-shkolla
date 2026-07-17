using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Appointments;
using Booking.Infrastructure.Notifications;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Booking.Tests.Unit.Notifications;

public class AppointmentNotificationTests
{
    private readonly Mock<IEmailService> _emailService = new();
    private readonly Mock<ISmsService> _smsService = new();

    private LoggingAppointmentNotificationService CreateSut() => new(
        _emailService.Object,
        _smsService.Object,
        NullLogger<LoggingAppointmentNotificationService>.Instance);

    private static AppointmentNotificationContext Context(string? phone) => new()
    {
        AppointmentId = Guid.NewGuid(),
        PatientEmail = "pacienti@test.dev",
        PatientPhoneNumber = phone,
        PatientName = "Testi Pacienti",
        DoctorName = "Arben Gashi",
        ClinicName = "Klinika Dentare Dardania",
        ServiceName = "Pastrim i dhëmbëve",
        StartDateTimeLocal = new DateTime(2026, 8, 17, 9, 0, 0)
    };

    [Fact]
    public async Task Created_SendsEmailAndSms_WhenPhonePresent()
    {
        await CreateSut().AppointmentCreatedAsync(Context("+383 44 123 456"));

        _emailService.Verify(
            e => e.SendAsync("pacienti@test.dev", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        _smsService.Verify(
            s => s.SendAsync("+383 44 123 456", It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Created_SkipsSms_WhenPhoneMissing()
    {
        await CreateSut().AppointmentCreatedAsync(Context(phone: null));

        _emailService.Verify(
            e => e.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        _smsService.Verify(
            s => s.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Cancelled_SendsEmail()
    {
        await CreateSut().AppointmentCancelledAsync(Context(phone: null));

        _emailService.Verify(
            e => e.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
