using CombatGame.Server.Hubs;
using CombatGame.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<AiController>();
builder.Services.AddSingleton<GameSessionService>();
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();
app.MapHub<GameHub>("/hub/game");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.Run();
