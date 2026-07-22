using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Booking.Application.Features.Auth;
using Booking.Domain.Enums;

namespace Booking.Tests.Integration;

public static class TestHelpers
{
    public static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    /// <summary>Data e hënës së ardhshme, së paku 7 ditë larg — brenda orarit të seed-uar (Hën–Pre) dhe jashtë cutoff-it të anulimit.</summary>
    public static DateOnly NextMonday()
    {
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(7);
        while (date.DayOfWeek != DayOfWeek.Monday)
        {
            date = date.AddDays(1);
        }

        return date;
    }

    public static async Task<AuthResponse> RegisterPatientAsync(HttpClient client, string? email = null)
    {
        email ??= $"pacient-{Guid.NewGuid():N}@test.dev";
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            FirstName: "Testi",
            LastName: "Integrimi",
            Email: email,
            PhoneNumber: "+383 44 000 000",
            Password: BookingApiFactory.DefaultUserPassword,
            DateOfBirth: new DateOnly(1992, 2, 2),
            Gender: Gender.Female,
            Address: null,
            City: "Prishtinë"), Json);

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    public static async Task<AuthResponse> LoginAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password), Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    public static HttpClient WithToken(this HttpClient client, string accessToken)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }
}
