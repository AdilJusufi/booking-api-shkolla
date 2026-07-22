using Booking.Application.Features.Auth;
using Booking.Application.Features.Schedules;
using Booking.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Application;

public class ValidatorTests
{
    private static RegisterRequest ValidRegisterRequest() => new(
        FirstName: "Testi",
        LastName: "Pacienti",
        Email: "test@test.dev",
        PhoneNumber: "+383 44 123 456",
        Password: "Fjalekalim1",
        DateOfBirth: new DateOnly(1995, 4, 20),
        Gender: Gender.Male,
        Address: null,
        City: "Prishtinë");

    [Fact]
    public void RegisterRequest_Valid_Passes()
    {
        new RegisterRequestValidator().Validate(ValidRegisterRequest()).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("jo-email")]
    [InlineData("")]
    public void RegisterRequest_InvalidEmail_Fails(string email)
    {
        var request = ValidRegisterRequest() with { Email = email };

        var result = new RegisterRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterRequest.Email));
    }

    [Theory]
    [InlineData("shkurt1A")] // OK: 8 karaktere, shkronjë e madhe + e vogël + shifër
    public void RegisterRequest_MinimalValidPassword_Passes(string password)
    {
        var request = ValidRegisterRequest() with { Password = password };
        new RegisterRequestValidator().Validate(request).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("vetemvogla1")] // pa shkronjë të madhe
    [InlineData("VETEMMEDHA1")] // pa shkronjë të vogël
    [InlineData("PaShifra!!")]  // pa shifër
    [InlineData("Shk1")]        // shumë i shkurtër
    public void RegisterRequest_WeakPassword_Fails(string password)
    {
        var request = ValidRegisterRequest() with { Password = password };
        new RegisterRequestValidator().Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void RegisterRequest_DateOfBirthInFuture_Fails()
    {
        var request = ValidRegisterRequest() with
        {
            DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1)
        };

        new RegisterRequestValidator().Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateWorkingSchedule_EndBeforeStart_Fails()
    {
        var request = new CreateWorkingScheduleRequest
        {
            ClinicBranchId = Guid.NewGuid(),
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(12, 0),
            EndTime = new TimeOnly(8, 0),
            SlotDurationMinutes = 30
        };

        new CreateWorkingScheduleRequestValidator().Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateWorkingSchedule_Valid_Passes()
    {
        var request = new CreateWorkingScheduleRequest
        {
            ClinicBranchId = Guid.NewGuid(),
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30
        };

        new CreateWorkingScheduleRequestValidator().Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateUnavailability_EndBeforeStart_Fails()
    {
        var request = new CreateUnavailabilityRequest
        {
            StartDateTime = new DateTime(2026, 8, 17, 10, 0, 0),
            EndDateTime = new DateTime(2026, 8, 17, 9, 0, 0)
        };

        new CreateUnavailabilityRequestValidator().Validate(request).IsValid.Should().BeFalse();
    }
}
