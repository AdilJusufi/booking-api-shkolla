using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Patients;
using Booking.Domain.Enums;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Çdo test përdor slot të ndryshëm të së hënës së ardhshme te Dr. Arben/Blerta,
/// që testet të mos konfliktohen mes vete (databaza është e përbashkët).
/// </summary>
[Collection("api")]
public class AppointmentsTests
{
    private readonly BookingApiFactory _factory;

    public AppointmentsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private static CreateAppointmentRequest CleaningAtArben(TimeOnly time, Guid? dependentId = null) => new()
    {
        DoctorId = DbSeeder.Ids.DoctorArben,
        ClinicBranchId = DbSeeder.Ids.BranchDardania,
        MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
        DependentId = dependentId,
        StartDateTime = TestHelpers.NextMonday().ToDateTime(time)
    };

    [Fact]
    public async Task CreateAppointment_ValidSlot_Returns201Pending()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.RegisterPatientAsync(client);
        client.WithToken(auth.AccessToken);

        var response = await client.PostAsJsonAsync("/api/appointments", CleaningAtArben(new TimeOnly(8, 0)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        appointment!.Status.Should().Be(AppointmentStatus.Pending);
        appointment.DoctorName.Should().Be("Arben Gashi");
        appointment.StartDateTime.TimeOfDay.Should().Be(TimeSpan.FromHours(8));
    }

    [Fact]
    public async Task DoubleBooking_TwoParallelRequestsForSameSlot_OnlyOneSucceeds()
    {
        // Dy pacientë të ndryshëm, i njëjti slot, kërkesa PARALELE:
        // exclusion constraint-i i PostgreSQL garanton që vetëm njëri fiton.
        var clientA = _factory.CreateClient();
        var clientB = _factory.CreateClient();
        clientA.WithToken((await TestHelpers.RegisterPatientAsync(clientA)).AccessToken);
        clientB.WithToken((await TestHelpers.RegisterPatientAsync(clientB)).AccessToken);

        var request = CleaningAtArben(new TimeOnly(9, 0));

        var responses = await Task.WhenAll(
            clientA.PostAsJsonAsync("/api/appointments", request, TestHelpers.Json),
            clientB.PostAsJsonAsync("/api/appointments", request, TestHelpers.Json));

        responses.Select(r => r.StatusCode).Should().BeEquivalentTo(
            [HttpStatusCode.Created, HttpStatusCode.Conflict],
            options => options.WithoutStrictOrdering());
    }

    [Fact]
    public async Task CancelAppointment_FreesTheSlot()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);
        var slotTime = new TimeOnly(11, 0);

        var createResponse = await client.PostAsJsonAsync("/api/appointments", CleaningAtArben(slotTime), TestHelpers.Json);
        var appointment = await createResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);

        var cancelResponse = await client.PostAsJsonAsync(
            $"/api/appointments/{appointment!.Id}/cancel",
            new CancelAppointmentRequest { Reason = "Test" }, TestHelpers.Json);

        cancelResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var cancelled = await cancelResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        cancelled!.Status.Should().Be(AppointmentStatus.CancelledByPatient);

        // Sloti çlirohet — statusi i anuluar nuk bllokon më kalendarin.
        var slots = await client.GetFromJsonAsync<List<AvailableSlotDto>>(
            $"/api/doctors/{DbSeeder.Ids.DoctorArben}/available-slots" +
            $"?branchId={DbSeeder.Ids.BranchDardania}&serviceId={DbSeeder.Ids.ServiceDentalCleaning}" +
            $"&date={TestHelpers.NextMonday():yyyy-MM-dd}", TestHelpers.Json);
        slots!.Should().Contain(s => s.StartDateTime.TimeOfDay == slotTime.ToTimeSpan());
    }

    [Fact]
    public async Task RescheduleAppointment_CreatesNewPendingAndMarksOldRescheduled()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);

        var createResponse = await client.PostAsJsonAsync("/api/appointments", CleaningAtArben(new TimeOnly(13, 0)), TestHelpers.Json);
        var original = await createResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);

        var rescheduleResponse = await client.PostAsJsonAsync(
            $"/api/appointments/{original!.Id}/reschedule",
            new RescheduleAppointmentRequest
            {
                NewStartDateTime = TestHelpers.NextMonday().ToDateTime(new TimeOnly(13, 30))
            }, TestHelpers.Json);

        rescheduleResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var replacement = await rescheduleResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        replacement!.Id.Should().NotBe(original.Id);
        replacement.Status.Should().Be(AppointmentStatus.Pending);
        replacement.StartDateTime.TimeOfDay.Should().Be(new TimeSpan(13, 30, 0));

        // Origjinali mbetet si histori me status Rescheduled.
        var oldAppointment = await client.GetFromJsonAsync<AppointmentDto>(
            $"/api/appointments/my/{original.Id}", TestHelpers.Json);
        oldAppointment!.Status.Should().Be(AppointmentStatus.Rescheduled);
    }

    [Fact]
    public async Task Appointment_OfAnotherPatient_IsNotVisible()
    {
        var clientA = _factory.CreateClient();
        var clientB = _factory.CreateClient();
        clientA.WithToken((await TestHelpers.RegisterPatientAsync(clientA)).AccessToken);
        clientB.WithToken((await TestHelpers.RegisterPatientAsync(clientB)).AccessToken);

        var createResponse = await clientA.PostAsJsonAsync("/api/appointments", CleaningAtArben(new TimeOnly(8, 30)), TestHelpers.Json);
        var appointment = await createResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);

        // 404, jo 403 — pacienti B nuk mëson as që termini ekziston.
        var response = await clientB.GetAsync($"/api/appointments/my/{appointment!.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task CreateAppointment_WithForeignDependent_Returns403()
    {
        var clientA = _factory.CreateClient();
        var clientB = _factory.CreateClient();
        clientA.WithToken((await TestHelpers.RegisterPatientAsync(clientA)).AccessToken);
        clientB.WithToken((await TestHelpers.RegisterPatientAsync(clientB)).AccessToken);

        // Pacienti A regjistron fëmijën e vet.
        var dependentResponse = await clientA.PostAsJsonAsync("/api/patients/me/dependents",
            new CreateDependentRequest
            {
                FirstName = "Fëmija",
                LastName = "iTesti",
                DateOfBirth = new DateOnly(2020, 6, 1),
                Gender = Gender.Male,
                Relationship = DependentRelationship.Child
            }, TestHelpers.Json);
        var dependent = await dependentResponse.Content.ReadFromJsonAsync<DependentDto>(TestHelpers.Json);

        // Pacienti B tenton të rezervojë me dependentin e A-së → refuzohet.
        var response = await clientB.PostAsJsonAsync("/api/appointments",
            new CreateAppointmentRequest
            {
                DoctorId = DbSeeder.Ids.DoctorBlerta,
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
                DependentId = dependent!.Id,
                StartDateTime = TestHelpers.NextMonday().ToDateTime(new TimeOnly(9, 0))
            }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PatientOverlap_SamePersonTwoDoctorsSameTime_Returns409()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);
        var time = new TimeOnly(10, 0);

        // Termini i parë te Dr. Blerta.
        var first = await client.PostAsJsonAsync("/api/appointments",
            new CreateAppointmentRequest
            {
                DoctorId = DbSeeder.Ids.DoctorBlerta,
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                MedicalServiceId = DbSeeder.Ids.ServiceDentalCheckup,
                StartDateTime = TestHelpers.NextMonday().ToDateTime(time)
            }, TestHelpers.Json);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        // I njëjti pacient, e njëjta orë, doktor tjetër → rregulli 10 e ndalon.
        var second = await client.PostAsJsonAsync("/api/appointments",
            new CreateAppointmentRequest
            {
                DoctorId = DbSeeder.Ids.DoctorArben,
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                MedicalServiceId = DbSeeder.Ids.ServiceDentalCheckup,
                StartDateTime = TestHelpers.NextMonday().ToDateTime(time)
            }, TestHelpers.Json);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}
